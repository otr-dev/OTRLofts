"use strict";

/** Hides a DOM element and optionally focuses on focusEl. */
function hideElement(el, focusEl) {
  el.style.display = "none";
  if (focusEl) focusEl.focus();
}

/** Shows a DOM element that has been hidden and optionally focuses on focusEl. */
function showElement(el, focusEl) {
  el.style.display = "block";
  if (focusEl) focusEl.focus();
}

/** Determines if a DOM element contains content that cannot be scrolled into view. */
function hasHiddenContent(el) {
  const noscroll = window.getComputedStyle(el).overflowY.includes("hidden");
  return noscroll && el.scrollHeight > el.clientHeight;
}

/** Format a Place Type string by capitalizing and replacing underscores with spaces. */
function formatPlaceType(str) {
  const capitalized = str.charAt(0).toUpperCase() + str.slice(1);
  return capitalized.replace(/_/g, " ");
}

/** Number of POIs to show on widget load. */
const ND_NUM_PLACES_INITIAL = 80;

/** Number of additional POIs to show when 'Show More' button is clicked. */
const ND_NUM_PLACES_SHOW_MORE = 5;

/** Maximum number of place photos to show on the details panel. */
const ND_NUM_PLACE_PHOTOS_MAX = 6;

/** Minimum zoom level at which the default map POI pins will be shown. */
const ND_DEFAULT_POI_MIN_ZOOM = 18;

/** Mapping of Place Types to Material Icons used to render custom map markers. */
const ND_MARKER_ICONS_BY_TYPE = {
  // Full list of icons can be found at https://fonts.google.com/icons
  _default: "circle",
  restaurant: "restaurant",
  bar: "local_bar",
  park: "park",
  stadium: "sports_handball",
  supermarket: "local_grocery_store",
  clothing_store: "local_mall",
  jewelry_store: "local_mall",
  home_goods_store: "local_mall",
  shopping_mall: "local_mall",
  primary_school: "school",
  secondary_school: "school",
  tourist_attraction: "local_see",
};

/**
 * Defines an instance of the Neighborhood Discovery widget, to be
 * instantiated when the Maps library is loaded.
 */
function NeighborhoodDiscovery(configuration) {
  const widget = this;
  const widgetEl = document.querySelector(".neighborhood-discovery");

  widget.center = configuration.mapOptions.center;
  widget.places = configuration.pois || [];

  // Initialize core functionalities -------------------------------------

  initializeMap();
  initializePlaceDetails();
  initializeSidePanel();

  // Initialize additional capabilities ----------------------------------

  initializeDistanceMatrix();
  initializeDirections();

  // Initializer function definitions ------------------------------------

  /** Initializes the interactive map and adds place markers. */
  function initializeMap() {
    const mapOptions = configuration.mapOptions;
    widget.mapBounds = new google.maps.Circle({
      center: widget.center,
      radius: configuration.mapRadius,
    }).getBounds();
    mapOptions.restriction = { latLngBounds: widget.mapBounds };
    mapOptions.mapTypeControlOptions = {
      position: google.maps.ControlPosition.TOP_RIGHT,
    };
    widget.map = new google.maps.Map(
      widgetEl.querySelector(".map"),
      mapOptions
    );
    widget.map.fitBounds(widget.mapBounds, /* padding= */ 0);
    widget.map.addListener("click", (e) => {
      // Check if user clicks on a POI pin from the base map.
      if (e.placeId) {
        e.stop();
        widget.selectPlaceById(e.placeId);
      }
    });
    widget.map.addListener("zoom_changed", () => {
      // Customize map styling to show/hide default POI pins or text based on zoom level.
      const hideDefaultPoiPins = widget.map.getZoom() < ND_DEFAULT_POI_MIN_ZOOM;
      widget.map.setOptions({
        styles: [
          {
            featureType: "poi",
            elementType: hideDefaultPoiPins ? "labels" : "labels.text",
            stylers: [{ visibility: "off" }],
          },
        ],
      });
    });

    const markerPath = widgetEl
      .querySelector(".marker-pin path")
      .getAttribute("d");
    const drawMarker = function (
      title,
      position,
      fillColor,
      strokeColor,
      labelText
    ) {
      return new google.maps.Marker({
        title: title,
        position: position,
        map: widget.map,
        icon: {
          path: markerPath,
          fillColor: fillColor,
          fillOpacity: 1,
          strokeColor: strokeColor,
          anchor: new google.maps.Point(13, 35),
          labelOrigin: new google.maps.Point(13, 13),
        },
        label: {
          text: labelText,
          color: "white",
          fontSize: "16px",
          fontFamily: "Material Icons",
        },
      });
    };

    // Add marker at the center location (if specified).
    if (configuration.centerMarker && configuration.centerMarker.icon) {
      drawMarker(
        "Home",
        widget.center,
        "#1A73E8",
        "#185ABC",
        configuration.centerMarker.icon
      );
    }

    // Add marker for the specified Place object.
    widget.addPlaceMarker = function (place) {
      place.marker = drawMarker(
        place.name,
        place.coords,
        "#00000",
        "#00000",
        place.icon
      );
      place.marker.addListener(
        "click",
        () => void widget.selectPlaceById(place.placeId)
      );
    };

    // Fit map to bounds that contain all markers of the specified Place objects.
    widget.updateBounds = function (places) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(widget.center);
      for (let place of places) {
        bounds.extend(place.marker.getPosition());
      }
      widget.map.fitBounds(bounds, /* padding= */ 100);
    };

    // Marker used to highlight a place from Autocomplete search.
    widget.selectedPlaceMarker = new google.maps.Marker({
      title: "Point of Interest",
    });
  }

  /** Initializes Place Details service for the widget. */
  function initializePlaceDetails() {
    const detailsService = new google.maps.places.PlacesService(widget.map);
    const placeIdsToDetails = new Map(); // Create object to hold Place results.

    for (let place of widget.places) {
      placeIdsToDetails.set(place.placeId, place);
      place.fetchedFields = new Set(["place_id"]);
    }

    widget.fetchPlaceDetails = function (placeId, fields, callback) {
      if (!placeId || !fields) return;

      // Check for field existence in Place object.
      let place = placeIdsToDetails.get(placeId);
      if (!place) {
        place = {
          placeId: placeId,
          fetchedFields: new Set(["place_id"]),
        };
        placeIdsToDetails.set(placeId, place);
      }
      const missingFields = fields.filter(
        (field) => !place.fetchedFields.has(field)
      );
      if (missingFields.length === 0) {
        callback(place);
        return;
      }

      const request = { placeId: placeId, fields: missingFields };
      let retryCount = 0;
      const processResult = function (result, status) {
        if (status !== google.maps.places.PlacesServiceStatus.OK) {
          // If query limit has been reached, wait before making another call;
          // Increase wait time of each successive retry with exponential backoff
          // and terminate after five failed attempts.
          if (
            status ===
              google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT &&
            retryCount < 5
          ) {
            const delay = (Math.pow(2, retryCount) + Math.random()) * 500;
            setTimeout(
              () => void detailsService.getDetails(request, processResult),
              delay
            );
            retryCount++;
          }
          return;
        }

        // Basic details.
        if (result.name) place.name = result.name;
        if (result.geometry) place.coords = result.geometry.location;
        if (result.formatted_address) place.address = result.formatted_address;
        if (result.photos) {
          place.photos = result.photos
            .map((photo) => ({
              urlSmall: photo.getUrl({ maxWidth: 200, maxHeight: 200 }),
              urlLarge: photo.getUrl({ maxWidth: 1200, maxHeight: 1200 }),
              attrs: photo.html_attributions,
            }))
            .slice(0, ND_NUM_PLACE_PHOTOS_MAX);
        }
        if (result.types) {
          place.type = formatPlaceType(result.types[0]);
          place.icon = ND_MARKER_ICONS_BY_TYPE["_default"];
          for (let type of result.types) {
            if (type in ND_MARKER_ICONS_BY_TYPE) {
              place.type = formatPlaceType(type);
              place.icon = ND_MARKER_ICONS_BY_TYPE[type];
              break;
            }
          }
        }
        if (result.url) place.url = result.url;

        for (let field of missingFields) {
          place.fetchedFields.add(field);
        }
        callback(place);
      };
      detailsService.getDetails(request, processResult);
    };
  }

  /** Initializes the side panel that holds curated POI results. */
  function initializeSidePanel() {
    const placesPanelEl = widgetEl.querySelector(".places-panel");
    const detailsPanelEl = widgetEl.querySelector(".details-panel");
    const placeResultsEl = widgetEl.querySelector(".place-results-list");
    const showMoreButtonEl = widgetEl.querySelector(".show-more-button");
    const photoModalEl = widgetEl.querySelector(".photo-modal");
    const detailsTemplate = Handlebars.compile(
      document.getElementById("nd-place-details-tmpl").innerHTML
    );
    const resultsTemplate = Handlebars.compile(
      document.getElementById("nd-place-results-tmpl").innerHTML
    );

    // Show specified POI photo in a modal.
    const showPhotoModal = function (photo, placeName) {
      const prevFocusEl = document.activeElement;
      const imgEl = photoModalEl.querySelector("img");
      imgEl.src = photo.urlLarge;
      const backButtonEl = photoModalEl.querySelector(".back-button");
      backButtonEl.addEventListener("click", () => {
        hideElement(photoModalEl, prevFocusEl);
        imgEl.src = "";
      });
      photoModalEl.querySelector(".photo-place").innerHTML = placeName;
      photoModalEl.querySelector(".photo-attrs span").innerHTML = photo.attrs;
      const attributionEl = photoModalEl.querySelector(".photo-attrs a");
      if (attributionEl) attributionEl.setAttribute("target", "_blank");
      photoModalEl.addEventListener("click", (e) => {
        if (e.target === photoModalEl) {
          hideElement(photoModalEl, prevFocusEl);
          imgEl.src = "";
        }
      });
      showElement(photoModalEl, backButtonEl);
    };

    // Select a place by id and show details.
    let selectedPlaceId;
    widget.selectPlaceById = function (placeId, panToMarker) {
      if (selectedPlaceId === placeId) return;
      selectedPlaceId = placeId;
      const prevFocusEl = document.activeElement;

      const showDetailsPanel = function (place) {
        detailsPanelEl.innerHTML = detailsTemplate(place);
        const backButtonEl = detailsPanelEl.querySelector(".back-button");
        backButtonEl.addEventListener("click", () => {
          hideElement(detailsPanelEl, prevFocusEl);
          selectedPlaceId = undefined;
          widget.updateDirections();
          widget.selectedPlaceMarker.setMap(null);
        });
        detailsPanelEl.querySelectorAll(".photo").forEach((photoEl, i) => {
          photoEl.addEventListener("click", () => {
            showPhotoModal(place.photos[i], place.name);
          });
        });
        showElement(detailsPanelEl, backButtonEl);
        detailsPanelEl.scrollTop = 0;
      };

      const processResult = function (place) {
        if (place.marker) {
          widget.selectedPlaceMarker.setMap(null);
        } else {
          widget.selectedPlaceMarker.setPosition(place.coords);
          widget.selectedPlaceMarker.setMap(widget.map);
        }
        if (panToMarker) {
          widget.map.panTo(place.coords);
        }
        showDetailsPanel(place);
        widget.fetchDuration(place, showDetailsPanel);
        widget.updateDirections(place);
      };

      widget.fetchPlaceDetails(
        placeId,
        [
          "name",
          "types",
          "geometry.location",
          "formatted_address",
          "photo",
          "url",
        ],
        processResult
      );
    };

    // Render the specified place objects and append them to the POI list.
    const renderPlaceResults = function (places, startIndex) {
      placeResultsEl.insertAdjacentHTML(
        "beforeend",
        resultsTemplate({ places: places })
      );
      placeResultsEl
        .querySelectorAll(".place-result")
        .forEach((resultEl, i) => {
          const place = places[i - startIndex];
          if (!place) return;
          // Clicking anywhere on the item selects the place.
          // Additionally, create a button element to make this behavior
          // accessible under tab navigation.
          resultEl.addEventListener("click", () => {
            widget.selectPlaceById(place.placeId, /* panToMarker= */ true);
          });
          resultEl.querySelector(".name").addEventListener("click", (e) => {
            widget.selectPlaceById(place.placeId, /* panToMarker= */ true);
            e.stopPropagation();
          });
          widget.addPlaceMarker(place);
        });
    };

    // Index of next Place object to show in the POI list.
    let nextPlaceIndex = 0;

    // Fetch and show basic info for the next N places.
    const showNextPlaces = function (n) {
      const nextPlaces = widget.places.slice(
        nextPlaceIndex,
        nextPlaceIndex + n
      );
      if (nextPlaces.length < 1) {
        hideElement(showMoreButtonEl);
        return;
      }
      showMoreButtonEl.disabled = true;
      // Keep track of the number of Places calls that have not finished.
      let count = nextPlaces.length;
      for (let place of nextPlaces) {
        const processResult = function (place) {
          count--;
          if (count > 0) return;
          renderPlaceResults(nextPlaces, nextPlaceIndex);
          nextPlaceIndex += n;
          widget.updateBounds(widget.places.slice(0, nextPlaceIndex));
          const hasMorePlacesToShow = nextPlaceIndex < widget.places.length;
          if (hasMorePlacesToShow || hasHiddenContent(placesPanelEl)) {
            showElement(showMoreButtonEl);
            showMoreButtonEl.disabled = false;
          } else {
            hideElement(showMoreButtonEl);
          }
        };
        widget.fetchPlaceDetails(
          place.placeId,
          ["name", "types", "geometry.location"],
          processResult
        );
      }
    };
    showNextPlaces(ND_NUM_PLACES_INITIAL);

    showMoreButtonEl.addEventListener("click", () => {
      placesPanelEl.classList.remove("no-scroll");
      showMoreButtonEl.classList.remove("sticky");
      showNextPlaces(ND_NUM_PLACES_SHOW_MORE);
    });
  }

  /** Initializes Distance Matrix service for the widget. */
  function initializeDistanceMatrix() {
    const distanceMatrixService = new google.maps.DistanceMatrixService();

    // Annotate travel times from the centered location to the specified place.
    widget.fetchDuration = function (place, callback) {
      if (!widget.center || !place || !place.coords || place.duration) return;
      const request = {
        origins: [widget.center],
        destinations: [place.coords],
        travelMode: google.maps.TravelMode.DRIVING,
      };
      distanceMatrixService.getDistanceMatrix(
        request,
        function (result, status) {
          if (status === google.maps.DistanceMatrixStatus.OK) {
            const trip = result.rows[0].elements[0];
            if (trip.status === google.maps.DistanceMatrixElementStatus.OK) {
              place.duration = trip.duration;
              callback(place);
            }
          }
        }
      );
    };
  }

  /** Initializes Directions service for the widget. */
  function initializeDirections() {
    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      preserveViewport: true,
    });

    // Update directions from the centered location to specified place.
    widget.updateDirections = function (place) {
      if (!widget.center || !place || !place.coords) {
        directionsRenderer.setMap(null);
        return;
      }
      // Use existing results if available.
      if (place.directions) {
        directionsRenderer.setMap(widget.map);
        directionsRenderer.setDirections(place.directions);
        return;
      }
      const request = {
        origin: widget.center,
        destination: place.coords,
        travelMode: google.maps.TravelMode.DRIVING,
      };
      directionsService.route(request, function (result, status) {
        if (status === google.maps.DirectionsStatus.OK) {
          place.directions = result;
          directionsRenderer.setMap(widget.map);
          directionsRenderer.setDirections(result);
        }
      });
    };
  }
}

const CONFIGURATION = {
  capabilities: {
    search: false,
    distances: false,
    directions: false,
    contacts: false,
    atmospheres: false,
    thumbnails: false,
  },
  pois: [
    { placeId: "ChIJlS8xEmmxQYgR79nUVdZZxM8" },
    { placeId: "ChIJLwacWEOxQYgRcu3UJQuLYwc" },
    { placeId: "ChIJj5FhLG-xQYgRNhr-7ontbKo" },
    { placeId: "ChIJsVqZjk6xQYgRy4tNuL4VF5k" },
    { placeId: "ChIJSQ2Qr3uxQYgREiFRWGYAwxc" },
    { placeId: "ChIJD1M8-VWxQYgRS8uaCQAi7uo" },
    { placeId: "ChIJfWU7P0WxQYgR0Z7qRaNJrUI" },
    { placeId: "ChIJi77WfdCzQYgRGbJHVBDHy-g" },
    { placeId: "ChIJYbsPtXSxQYgR5HtpffZrJSM" },
    { placeId: "ChIJ1YpO6mOxQYgRavAlyMV6XLo" },
    { placeId: "ChIJI86THG-xQYgRejQQ5jfFn-8" },
    { placeId: "ChIJjb_3f3uxQYgRF7Y0xlBe3k4" },
    { placeId: "ChIJjRZsJFqxQYgR3-6dR7pZp1c" },
    { placeId: "ChIJJ9RPSFexQYgRObpI3iAbiWI" },
    { placeId: "ChIJs98Fx1GxQYgRG4oFwtptedA" },
    { placeId: "ChIJ4dJZfge0QYgRRFMAp0GhxNs" },
    { placeId: "ChIJ711vdlaxQYgRzr1gkMv10s4" },
    { placeId: "ChIJTWP52Aa0QYgRT4EsvdIMM74" },
    { placeId: "ChIJq3uuZ_mzQYgRT55EisBBH7s" },
    { placeId: "ChIJn0mB_fmzQYgRfzkI2S0BSaE" },
  ],
  centerMarker: { icon: "circle" },
  mapRadius: 2000,
  mapOptions: {
    center: { lat: 39.1098727, lng: -84.5063785 },
    fullscreenControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    zoom: 16,
    zoomControl: true,
    maxZoom: 20,
    mapId: "5e418589c716b67b",
  },
  mapsApiKey: "AIzaSyDnNk-aWiB0neUZY6n9fvOWewBJd1Ke7MQ",
};

function initMap() {
  new NeighborhoodDiscovery(CONFIGURATION);
}
