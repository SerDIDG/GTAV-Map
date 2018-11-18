$(function() {
	var showCoordinations = true;

	if (window.location.protocol != "https:") {
	    window.location.href = "https:" + window.location.href.substring(window.location.protocol.length);		
	}


	var $types = $('.types');

	var onResize = function() {
		$types.css({
			maxHeight: $(window).height() - parseInt($types.css('marginTop'), 10) - parseInt($types.css('marginBottom'), 10) - parseInt($('header').height()) + 6
		});
	};

	onResize();

	$(window).resize(onResize);
	
	var currentMarker;
	
	var assetsUrl = function() {
		return window.location.hostname == 'localhost' ? '' : 'https://serdidg.github.io/GTAV-Map/';
	};

	Handlebars.registerHelper('assetsUrl', assetsUrl);

	var timestampToSeconds = function(stamp) {
		stamp = stamp.split(':');
		return (parseInt(stamp[0], 10) * 60) + parseInt(stamp[1], 10);
	};

	Handlebars.registerHelper('timestampToSeconds', timestampToSeconds);

	var Vent = _.extend({}, Backbone.Events);

	var LocationModel = Backbone.Model.extend({
		initialize: function() {
			var marker = new google.maps.Marker({
				position: new google.maps.LatLng(this.get('lat'), this.get('lng')),
				icon: {
					url: assetsUrl()+'icons/'+categories.getIcon(this.get('type')),
					scaledSize: new google.maps.Size(32, 37),
				}
			});

			_.bindAll(this, 'markerClicked');
			google.maps.event.addListener(marker, 'click', this.markerClicked);

			this.set({ marker: marker });
		},

		markerClicked: function() {
			Vent.trigger('location:clicked', this);
		},

		removeHighlight: function() {
			this.get('marker').setIcon({
				url: this.get('marker').getIcon().url,
				scaledSize: new google.maps.Size(22, 22)
			});
		},

		highlightMarker: function() {
			if (currentMarker == this) {
				Vent.trigger('location:clicked', this);
			}
			else {
				if (currentMarker) currentMarker.removeHighlight();
				mapView.closePopupLocation();
				currentMarker = this;
				this.get('marker').setIcon({
					url: this.get('marker').getIcon().url,
					scaledSize: new google.maps.Size(32, 32)
				});
			}
		}
	});
	var LocationsCollection = Backbone.Collection.extend({
		model: LocationModel,
		url: 'locations.json'
	});

	var locations = window.locations = new LocationsCollection();

	var CategoryModel = Backbone.Model.extend({ });
	var CategoriesCollection = Backbone.Collection.extend({

		model: CategoryModel,

		getIcon: function(type) {
			var o = this.findWhere({ name: type });
			if (o) {
				return o.get('icon');
			}

			return assetsUrl() + (o ? o.get('icon') : 'blank.png');
		},

		forView: function(type) {
			var g = this.groupBy('type');
			return _(g).map(function(categories, type) {
				return {
					name: type,
					types: _.map(categories, function(category) { return category.toJSON(); })
				}
			});
		}

	});

	var categories = window.cats = new CategoriesCollection([
        {
            name: 'Easter Eggs',
            icon: 'General/easter-eggs.png',
            type: 'General',
            enabled: true
        }
	]);

	var MapView = Backbone.View.extend({

		initialize: function() {
			this.mapType = 'Road';
			this.mapDetails = { 'Atlas': '#0fa8d2', 'Satellite': '#143d6b', 'Road': '#1862ad' };
			this.mapOptions = {
				center: new google.maps.LatLng(66, -125),
				zoom: 4,
				disableDefaultUI: false,
                streetViewControl: false,
				mapTypeControl: true,
				mapTypeControlOptions: { mapTypeIds: _.keys(this.mapDetails) },
				mapTypeId: this.mapType
			};

			_.bindAll(this, 'getTileImage', 'updateMapBackground');

			this.popupTemplate = Handlebars.compile($('#markerPopupTemplate2').html());

			this.listenTo(Vent, 'locations:visible', this.showLocations);
			this.listenTo(Vent, 'locations:invisible', this.hideLocations);

			this.listenTo(Vent, 'location:clicked', this.popupLocation);
		},

		render: function() {

			// Function to update coordination info windows
		    function updateCoordinationWindow(markerobject){
		        // Create new info window
				var infoWindow = new google.maps.InfoWindow;

				// onClick listener
				google.maps.event.addListener(markerobject, 'click', function(evt){
					// Set content
				    infoWindow.setOptions({
				        content: '<p>' + 'Current Lat: ' + evt.latLng.lat().toFixed(3) + '<br>' + 'Current Lng: ' + evt.latLng.lng().toFixed(3) + '<br>' + 'Zoom Level: ' + map.getZoom() + '</p>'
				    });

				    // Open the info window
				    infoWindow.open(map, markerobject);
				});

				// onDrag listener
				google.maps.event.addListener(markerobject, 'drag', function(evt){
					// Set content
				    infoWindow.setOptions({
				        content: '<p>' + 'Current Lat: ' + evt.latLng.lat().toFixed(3) + '<br>' + 'Current Lng: ' + evt.latLng.lng().toFixed(3) + '<br>' + 'Zoom Level: ' + map.getZoom() + '</p>'
				    });
				});
			}

			var map = this.map = window.map = new google.maps.Map(this.el, this.mapOptions);

			this.initMapTypes(map, _.keys(this.mapDetails));

			google.maps.event.addListener(map, 'maptypeid_changed', this.updateMapBackground);

			google.maps.event.addDomListener(map, 'tilesloaded', function() {
				if ($('#mapControlWrap').length == 0) {
					$('div.gmnoprint').last().wrap('<div id="mapControlWrap" />');
				}
			});
            /*
			window.locs = [];
			google.maps.event.addListener(map, 'rightclick', function(e) {
				var marker = new google.maps.Marker({
					map: map,
					moveable: true,
					draggable: true,
					position: e.latLng
				});
				window.locs.push(marker);

				// Check if coords mode is enabled
				if (showCoordinations) {
					// Update/create info window
					updateCoordinationWindow(marker);
				}
			});
            */
			return this;
		},

		getMap: function() {
			return this.map;
		},

		initMapTypes: function(map, types) {
			_.each(types, function(type) {
				var mapTypeOptions = {
					maxZoom: 7,
					minZoom: 3,
					name: type,
					tileSize: new google.maps.Size(256, 256),
					getTileUrl: this.getTileImage
				};
				map.mapTypes.set(type, new google.maps.ImageMapType(mapTypeOptions));
			}, this);
		},

		updateMapBackground: function() {
			this.mapType = this.map.getMapTypeId();
			this.$el.css({
				backgroundColor: this.mapDetails[this.mapType]
			});
		},

		getTileImage: function(rawCoordinates, zoomLevel) {
			var coord = this.normalizeCoordinates(rawCoordinates, zoomLevel);
			if ( ! coord) {
				return null;
			}

			return assetsUrl() + 'tiles/' + this.mapType.toLowerCase() + '/' + zoomLevel + '-' + coord.x + '_' + coord.y + '.png';
		},

		normalizeCoordinates: function(coord, zoom) {
			var y = coord.y;
			var x = coord.x;

			// tile range in one direction range is dependent on zoom level
			// 0 = 1 tile, 1 = 2 tiles, 2 = 4 tiles, 3 = 8 tiles, etc
			var tileRange = 1 << zoom;

			// don't repeat across y-axis (vertically)
			if (y < 0 || y >= tileRange) {
				return null;
			}

			// repeat across x-axis
			if (x < 0 || x >= tileRange) {
				x = (x % tileRange + tileRange) % tileRange;
			}

			return {
				x: x,
				y: y
			};
		},

		showLocations: function(locations) {
			_.each(locations, function(location) {
				var marker = location.get('marker');
				if ( ! marker.getMap()) {
					marker.setMap(this.map);
				}
				marker.setVisible(true);
			}, this);
		},

		hideLocations: function(locations) {
			_.each(locations, function(location) {
				location.get('marker').setVisible(false);
			});
		},

		popupLocation: function(location, panTo) {
            var infoWindow = new google.maps.InfoWindow({
                content: this.popupTemplate(location.toJSON())
            });

            infoWindow.setOptions({
                maxHeight: 400
            });

            if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
                infoWindow.setOptions({
                    maxWidth: 180,
                    maxHeight: 300
                });
            }

            infoWindow.open(this.map, location.get('marker'));

            this.closePopupLocation();
            this.currentInfoWindow = infoWindow;
		},

		closePopupLocation: function() {
			if (this.currentInfoWindow) {
				this.currentInfoWindow.close();
			}
		}

	});

	var mapView = new MapView({
		el: '#map'
	});

	locations.fetch().done(function() {
		mapView.render();

		categories.chain()
				  .filter(function(c) { return c.get('enabled'); })
				  .map(function(c) { return c.get('name'); })
				  .map(function(name) {
				  	return locations.where({ type: name })
				  })
				  .each(function(locs) {
				  	Vent.trigger('locations:visible', locs);
				  })
				  .value();
	});

	$('#tour-prev, #tour-next').click(function(e) {
		e.preventDefault();
		var navTo = $(this).text();
		var x = locations.findWhere({ title: navTo });
		if (x) Vent.trigger('location:clicked', x, true);
	});

});
