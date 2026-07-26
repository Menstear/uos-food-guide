const restaurantGroups = document.querySelector("#restaurant-groups");
const restaurantCount = document.querySelector("#restaurant-count");
const restaurantDialog = document.querySelector("#restaurant-dialog");
const restaurantForm = document.querySelector("#restaurant-form");
const restaurantPhotoInput = document.querySelector("#restaurant-photos");
const restaurantThumbnailField = document.querySelector("#restaurant-thumbnail-field");
const restaurantThumbnailPicker = document.querySelector("#restaurant-thumbnail-picker");
const restaurantThumbnailHelp = document.querySelector("#restaurant-thumbnail-help");
const openRestaurantDialog = document.querySelector("#open-restaurant-dialog");
const closeRestaurantDialog = document.querySelector("#close-restaurant-dialog");
const cancelRestaurantDialog = document.querySelector("#cancel-restaurant-dialog");
const registrationMessage = document.querySelector("#registration-message");
const restaurantDialogLabel = document.querySelector("#restaurant-dialog-label");
const restaurantDialogTitle = document.querySelector("#restaurant-dialog-title");
const formIntro = document.querySelector("#restaurant-form-intro");
const restaurantPhotoHelp = document.querySelector("#restaurant-photo-help");
const formSubmitButton = restaurantForm.querySelector(".form-submit");
const photoGalleryDialog = document.querySelector("#photo-gallery-dialog");
const closePhotoGallery = document.querySelector("#close-photo-gallery");
const photoGalleryTitle = document.querySelector("#photo-gallery-title");
const photoGallerySummary = document.querySelector("#photo-gallery-summary");
const photoGalleryGrid = document.querySelector("#photo-gallery-grid");
const savedRestaurantsKey = "uosFoodGuideSavedRestaurants";
const maxPhotosPerRestaurant = 6;
const maxPhotoDimension = 1200;
const restaurantAreas = [
  {
    id: "main-gate",
    label: "Main Gate",
    description: "Closest to the University of Seoul main entrance.",
  },
  {
    id: "back-gate",
    label: "Back Gate",
    description: "Around the residential side of campus behind the university.",
  },
  {
    id: "hoegi-station",
    label: "Near Hoegi Station",
    description: "Places around Hoegi Station, a short trip from campus.",
  },
];
const restaurantAreaIds = new Set(restaurantAreas.map((area) => area.id));
const sharedConfig = getSharedConfig();
const publishedRestaurants = Array.isArray(window.uosRestaurants) ? window.uosRestaurants : [];
const sharedRestaurants = [];
const savedRestaurants = loadSavedRestaurants();
const restaurants = [];
const restaurantRailScrollbars = new WeakMap();
let editingRestaurant = null;
let restaurantRailResizeObserver = null;
let selectedThumbnailCandidate = null;
let thumbnailPreviewUrls = [];

const restaurantFields = [
  ["Address", "address"],
  ["Best for", "bestFor"],
  ["Price range", "priceRange"],
  ["Walking time", "walkingTime"],
  ["Visitor-friendly", "foreignerFriendly"],
];

function addTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  element.textContent = text;
  parent.append(element);
  return element;
}

function createRestaurantId() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePhotos(photos) {
  if (!Array.isArray(photos)) {
    return [];
  }

  return photos.filter((photo) => typeof photo === "string" && isSafeImageUrl(photo));
}

function normalizeArea(area) {
  return restaurantAreaIds.has(area) ? area : "main-gate";
}

function normalizeRestaurant(restaurant) {
  const thumbnailPhoto = restaurant.thumbnailPhoto || restaurant.thumbnail_photo || "";

  return {
    ...restaurant,
    id: typeof restaurant.id === "string" ? restaurant.id : createRestaurantId(),
    area: normalizeArea(restaurant.area),
    bestFor: restaurant.bestFor || restaurant.best_for || "",
    priceRange: restaurant.priceRange || restaurant.price_range || "",
    walkingTime: restaurant.walkingTime || restaurant.walking_time || "",
    foreignerFriendly: restaurant.foreignerFriendly || restaurant.foreigner_friendly || "",
    mapLink: restaurant.mapLink || restaurant.map_link || "",
    mapLinkLabel: restaurant.mapLinkLabel || restaurant.map_link_label || "",
    thumbnailPhoto:
      typeof thumbnailPhoto === "string" && isSafeImageUrl(thumbnailPhoto)
        ? thumbnailPhoto
        : "",
    photos: normalizePhotos(restaurant.photos),
  };
}

function loadSavedRestaurants() {
  try {
    const storedRestaurants = window.localStorage.getItem(savedRestaurantsKey);
    const parsedRestaurants = JSON.parse(storedRestaurants || "[]");

    if (!Array.isArray(parsedRestaurants)) {
      return [];
    }

    return parsedRestaurants
      .filter((restaurant) => restaurant && typeof restaurant === "object")
      .map(normalizeRestaurant);
  } catch {
    return [];
  }
}

function saveRestaurants() {
  try {
    window.localStorage.setItem(savedRestaurantsKey, JSON.stringify(savedRestaurants));
    return true;
  } catch {
    return false;
  }
}

function isSafeMapUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getNaverMapLink(restaurant) {
  const existingLink = restaurant.mapLink || restaurant.googleMapsLink || "";

  try {
    const existingUrl = new URL(existingLink);

    if (existingUrl.hostname === "map.naver.com" || existingUrl.hostname.endsWith(".naver.com")) {
      return existingUrl.toString();
    }
  } catch {
    // Build a Naver Map search URL when no valid Naver Map place link is stored.
  }

  const query = [restaurant.name, restaurant.address]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ");

  return query ? `https://map.naver.com/p/search/${encodeURIComponent(query)}` : "";
}

function isSafeImageUrl(value) {
  if (value.startsWith("data:image/")) {
    return true;
  }

  return isSafeMapUrl(value);
}

function getSharedConfig() {
  const config = window.uosSupabaseConfig || {};
  const url = String(config.url || "").replace(/\/+$/, "");
  const publishableKey = String(config.publishableKey || "").trim();
  const bucket = String(config.bucket || "restaurant-photos").trim();

  return {
    url,
    publishableKey,
    bucket,
    enabled: isSafeMapUrl(url) && publishableKey.length > 0 && /^[a-z0-9-]+$/i.test(bucket),
  };
}

function getSharedHeaders(extraHeaders = {}) {
  return {
    apikey: sharedConfig.publishableKey,
    Authorization: `Bearer ${sharedConfig.publishableKey}`,
    ...extraHeaders,
  };
}

async function getResponseError(response, fallbackMessage) {
  try {
    const body = await response.json();
    const message = body.message || body.error || body.error_description || body.hint;

    if (typeof message === "string" && message) {
      return new Error(message);
    }
  } catch {
    // Use the plain-language fallback when Supabase returns no JSON error body.
  }

  return new Error(fallbackMessage);
}

function getRestaurantIdentity(restaurant) {
  return [restaurant.name, restaurant.address]
    .map((value) => String(value || "").trim().toLocaleLowerCase())
    .join("|");
}

function hidePhotoLessDuplicates(restaurantList) {
  const identitiesWithPhotos = new Set(
    restaurantList
      .filter((restaurant) => normalizePhotos(restaurant.photos).length > 0)
      .map(getRestaurantIdentity),
  );

  // Prefer the community entry when it supplies a photo for the same place.
  return restaurantList.filter((restaurant) => {
    return normalizePhotos(restaurant.photos).length > 0
      || !identitiesWithPhotos.has(getRestaurantIdentity(restaurant));
  });
}

function refreshRestaurants() {
  const restaurantsById = new Map();
  const fallbackRestaurants = sharedConfig.enabled ? [] : publishedRestaurants;

  [...fallbackRestaurants, ...sharedRestaurants, ...savedRestaurants].forEach((restaurant) => {
    const normalizedRestaurant = normalizeRestaurant(restaurant);
    restaurantsById.set(normalizedRestaurant.id, normalizedRestaurant);
  });

  restaurants.splice(
    0,
    restaurants.length,
    ...hidePhotoLessDuplicates([...restaurantsById.values()]),
  );
  renderRestaurants();
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }

  dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
    return;
  }

  dialog.removeAttribute("open");
}

function createPhotoHeader(restaurant) {
  const photos = normalizePhotos(restaurant.photos);

  if (photos.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "restaurant-photo-placeholder";
    placeholder.textContent = restaurant.cuisine || "Restaurant";
    return placeholder;
  }

  const photoButton = document.createElement("button");
  photoButton.className = "restaurant-photo-button";
  photoButton.type = "button";
  photoButton.setAttribute("aria-label", `View photos for ${restaurant.name || "this restaurant"}`);

  const photo = document.createElement("img");
  photo.className = "restaurant-photo";
  photo.src = photos.includes(restaurant.thumbnailPhoto)
    ? restaurant.thumbnailPhoto
    : photos[0];
  photo.alt = `${restaurant.name || "Restaurant"} representative photo`;
  photoButton.append(photo);

  const photoCount = document.createElement("span");
  photoCount.className = "photo-count";
  photoCount.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"}`;
  photoButton.append(photoCount);
  photoButton.addEventListener("click", () => openPhotoGallery(restaurant));

  return photoButton;
}

function createRestaurantCard(restaurant) {
  const card = document.createElement("article");
  card.className = "restaurant-card";
  card.append(createPhotoHeader(restaurant));

  const content = document.createElement("div");
  content.className = "restaurant-card-content";
  addTextElement(content, "p", "card-label", restaurant.cuisine || "Restaurant");
  addTextElement(content, "h3", "restaurant-name", restaurant.name || "Unnamed restaurant");

  const details = document.createElement("dl");
  details.className = "restaurant-details";

  restaurantFields.forEach(([label, key]) => {
    const value = restaurant[key];

    if (!value) {
      return;
    }

    const row = document.createElement("div");
    addTextElement(row, "dt", "", label);
    addTextElement(row, "dd", "", value);
    details.append(row);
  });

  content.append(details);

  if (restaurant.notes) {
    addTextElement(content, "p", "restaurant-notes", restaurant.notes);
  }

  const actions = document.createElement("div");
  actions.className = "restaurant-card-actions";

  const naverMapLink = getNaverMapLink(restaurant);

  if (isSafeMapUrl(naverMapLink)) {
    const mapLink = document.createElement("a");
    mapLink.className = "map-link";
    mapLink.href = naverMapLink;
    mapLink.target = "_blank";
    mapLink.rel = "noreferrer";
    mapLink.textContent = "Open in Naver Map";
    actions.append(mapLink);
  }

  const thumbnailButton = document.createElement("button");
  thumbnailButton.className = "edit-restaurant-button";
  thumbnailButton.type = "button";
  thumbnailButton.textContent = "Set thumbnail";
  thumbnailButton.setAttribute(
    "aria-label",
    `Set thumbnail for ${restaurant.name || "this restaurant"}`,
  );
  thumbnailButton.addEventListener("click", () => openEditRestaurantForm(restaurant));
  actions.append(thumbnailButton);

  const editButton = document.createElement("button");
  editButton.className = "edit-restaurant-button";
  editButton.type = "button";
  editButton.textContent = sharedConfig.enabled ? "Suggest edit" : "Edit";
  editButton.setAttribute("aria-label", `Edit ${restaurant.name || "this restaurant"}`);
  editButton.addEventListener("click", () => openEditRestaurantForm(restaurant));
  actions.append(editButton);

  if (savedRestaurants.some((savedRestaurant) => savedRestaurant.id === restaurant.id)) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-restaurant-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteRestaurant(restaurant));
    actions.append(deleteButton);
  }

  if (actions.childElementCount > 0) {
    content.append(actions);
  }

  card.append(content);
  return card;
}

function syncRestaurantRailScrollbar(areaGrid) {
  const scrollbar = restaurantRailScrollbars.get(areaGrid);

  if (!scrollbar) {
    return;
  }

  const maximumScrollLeft = Math.max(0, areaGrid.scrollWidth - areaGrid.clientWidth);
  scrollbar.max = String(maximumScrollLeft);
  scrollbar.value = String(Math.min(Math.max(areaGrid.scrollLeft, 0), maximumScrollLeft));
  scrollbar.disabled = maximumScrollLeft === 0;
}

function renderRestaurants() {
  restaurantRailResizeObserver?.disconnect();
  restaurantRailResizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
      entries.forEach((entry) => syncRestaurantRailScrollbar(entry.target));
    })
    : null;
  restaurantGroups.replaceChildren();
  restaurantCount.textContent = String(restaurants.length);

  restaurantAreas.forEach((area) => {
    const areaSection = document.createElement("section");
    areaSection.className = "restaurant-area";
    areaSection.setAttribute("aria-labelledby", `${area.id}-title`);

    const heading = document.createElement("div");
    heading.className = "area-heading";
    const headingCopy = document.createElement("div");
    addTextElement(headingCopy, "p", "section-label", area.label);
    const title = addTextElement(headingCopy, "h3", "", area.label);
    title.id = `${area.id}-title`;
    addTextElement(headingCopy, "p", "area-description", area.description);

    const areaRestaurants = restaurants.filter(
      (restaurant) => normalizeArea(restaurant.area) === area.id,
    );
    const areaGrid = document.createElement("div");
    areaGrid.className = "restaurant-grid";
    let horizontalScrollbar = null;

    const areaMeta = document.createElement("div");
    areaMeta.className = "area-meta";
    addTextElement(
      areaMeta,
      "p",
      "area-count",
      `${areaRestaurants.length} place${areaRestaurants.length === 1 ? "" : "s"}`,
    );
    heading.append(headingCopy, areaMeta);

    if (areaRestaurants.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "area-empty";
      addTextElement(emptyState, "p", "", "No restaurants added in this area yet.");
      areaGrid.append(emptyState);
    } else {
      areaRestaurants.forEach((restaurant) => {
        areaGrid.append(createRestaurantCard(restaurant));
      });
    }

    if (areaRestaurants.length > 0) {
      const controls = document.createElement("div");
      controls.className = "area-scroll-controls";

      const previousButton = document.createElement("button");
      previousButton.className = "area-scroll-button";
      previousButton.type = "button";
      previousButton.textContent = "Prev";
      previousButton.setAttribute("aria-label", `Show previous ${area.label} restaurants`);

      const nextButton = document.createElement("button");
      nextButton.className = "area-scroll-button";
      nextButton.type = "button";
      nextButton.textContent = "Next";
      nextButton.setAttribute("aria-label", `Show more ${area.label} restaurants`);

      const scrollCards = (direction) => {
        areaGrid.scrollBy({
          left: direction * Math.max(areaGrid.clientWidth * 0.82, 240),
          behavior: "smooth",
        });
      };

      areaGrid.addEventListener(
        "wheel",
        (event) => {
          if (
            event.shiftKey ||
            event.deltaY === 0 ||
            areaGrid.scrollWidth <= areaGrid.clientWidth
          ) {
            return;
          }

          const maximumScrollLeft = areaGrid.scrollWidth - areaGrid.clientWidth;
          const nextScrollLeft = areaGrid.scrollLeft + event.deltaY;
          const canScrollInDirection =
            (event.deltaY < 0 && areaGrid.scrollLeft > 0) ||
            (event.deltaY > 0 && areaGrid.scrollLeft < maximumScrollLeft);

          if (!canScrollInDirection) {
            return;
          }

          event.preventDefault();
          areaGrid.scrollLeft = Math.min(
            Math.max(nextScrollLeft, 0),
            maximumScrollLeft,
          );
        },
        { passive: false },
      );

      previousButton.addEventListener("click", () => scrollCards(-1));
      nextButton.addEventListener("click", () => scrollCards(1));
      controls.append(previousButton, nextButton);
      areaMeta.append(controls);

      horizontalScrollbar = document.createElement("input");
      horizontalScrollbar.className = "restaurant-scrollbar";
      horizontalScrollbar.type = "range";
      horizontalScrollbar.min = "0";
      horizontalScrollbar.max = "0";
      horizontalScrollbar.value = "0";
      horizontalScrollbar.step = "1";
      horizontalScrollbar.setAttribute("aria-label", `Scroll ${area.label} restaurants`);
      restaurantRailScrollbars.set(areaGrid, horizontalScrollbar);
      areaGrid.addEventListener("scroll", () => syncRestaurantRailScrollbar(areaGrid), {
        passive: true,
      });
      horizontalScrollbar.addEventListener("input", () => {
        areaGrid.scrollLeft = Number(horizontalScrollbar.value);
      });
      restaurantRailResizeObserver?.observe(areaGrid);
    }

    areaSection.append(heading, areaGrid);

    if (horizontalScrollbar) {
      areaSection.append(horizontalScrollbar);
      requestAnimationFrame(() => syncRestaurantRailScrollbar(areaGrid));
    }

    restaurantGroups.append(areaSection);
  });
}

function openPhotoGallery(restaurant) {
  const photos = normalizePhotos(restaurant.photos);

  photoGalleryGrid.replaceChildren();
  photoGalleryTitle.textContent = `${restaurant.name || "Restaurant"} photos`;
  photoGallerySummary.textContent = `${photos.length} photo${photos.length === 1 ? "" : "s"} in this gallery.`;

  photos.forEach((photoUrl, index) => {
    const photo = document.createElement("img");
    photo.className = "gallery-photo";
    photo.src = photoUrl;
    photo.alt = `${restaurant.name || "Restaurant"} photo ${index + 1}`;
    photoGalleryGrid.append(photo);
  });

  openDialog(photoGalleryDialog);
}

function deleteRestaurant(restaurant) {
  const shouldDelete = window.confirm(
    `Delete ${restaurant.name || "this restaurant"} from this browser?`,
  );

  if (!shouldDelete) {
    return;
  }

  const savedIndex = savedRestaurants.findIndex(
    (savedRestaurant) => savedRestaurant.id === restaurant.id,
  );

  if (savedIndex === -1) {
    return;
  }

  savedRestaurants.splice(savedIndex, 1);
  saveRestaurants();
  refreshRestaurants();
  registrationMessage.textContent = `${restaurant.name || "The restaurant"} was deleted from this browser.`;
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("The photo could not be read."));
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error("The photo could not be processed."));
      image.onload = () => {
        const scale = Math.min(1, maxPhotoDimension / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("The photo could not be processed."));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function preparePhotos(fileList) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));

  if (files.length === 0) {
    throw new Error("Choose at least one image file.");
  }

  if (files.length > maxPhotosPerRestaurant) {
    throw new Error(`Choose up to ${maxPhotosPerRestaurant} photos.`);
  }

  return Promise.all(files.map((file) => compressPhoto(file)));
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);

  if (!response.ok) {
    throw new Error("The photo could not be prepared for upload.");
  }

  return response.blob();
}

function getPublicPhotoUrl(path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${sharedConfig.url}/storage/v1/object/public/${encodeURIComponent(sharedConfig.bucket)}/${encodedPath}`;
}

async function uploadCommunityPhotos(restaurantId, photos) {
  const uploadUrls = [];

  for (const [index, photo] of photos.entries()) {
    const path = `submissions/${restaurantId}/${index + 1}.jpg`;
    const photoBlob = await dataUrlToBlob(photo);
    const response = await fetch(
      `${sharedConfig.url}/storage/v1/object/${encodeURIComponent(sharedConfig.bucket)}/${path}`,
      {
        method: "POST",
        headers: getSharedHeaders({
          "Content-Type": "image/jpeg",
          "x-upsert": "false",
        }),
        body: photoBlob,
      },
    );

    if (!response.ok) {
      throw await getResponseError(response, "The photos could not be uploaded.");
    }

    uploadUrls.push(getPublicPhotoUrl(path));
  }

  return uploadUrls;
}

async function submitCommunityRestaurant(restaurant) {
  const photoUrls = await uploadCommunityPhotos(restaurant.id, restaurant.photos);
  const thumbnailPhoto = resolveThumbnailPhoto(restaurant, photoUrls);
  const response = await fetch(`${sharedConfig.url}/rest/v1/restaurants`, {
    method: "POST",
    headers: getSharedHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify({
      id: restaurant.id,
      name: restaurant.name,
      address: restaurant.address,
      area: restaurant.area,
      cuisine: restaurant.cuisine,
      price_range: restaurant.priceRange,
      map_link: getNaverMapLink(restaurant),
      map_link_label: "Open in Naver Map",
      notes: restaurant.notes,
      thumbnail_photo: thumbnailPhoto,
      photos: photoUrls,
    }),
  });

  if (!response.ok) {
    throw await getResponseError(response, "The restaurant could not be submitted.");
  }
}

async function ensureRestaurantEditSuggestionsTableExists() {
  const endpoint = new URL(`${sharedConfig.url}/rest/v1/restaurant_edit_suggestions`);
  endpoint.searchParams.set("select", "thumbnail_photo");
  endpoint.searchParams.set("limit", "1");
  const response = await fetch(endpoint, { headers: getSharedHeaders() });

  if (response.status === 404) {
    throw new Error(
      "Restaurant edits are not enabled yet. Ask the site owner to run the latest Supabase setup SQL.",
    );
  }

  if (!response.ok) {
    const error = await getResponseError(response, "Restaurant edits could not be checked.");

    if (error.message.includes("thumbnail_photo")) {
      throw new Error(
        "Thumbnail edits are not enabled yet. Ask the site owner to run the latest Supabase setup SQL.",
      );
    }

    throw error;
  }
}

async function submitRestaurantEditSuggestion(targetRestaurant, restaurant) {
  await ensureRestaurantEditSuggestionsTableExists();

  const suggestionId = createRestaurantId();
  const photoUrls = restaurant.photos.length > 0
    ? await uploadCommunityPhotos(suggestionId, restaurant.photos)
    : [];
  const thumbnailPhoto = resolveThumbnailPhoto(restaurant, photoUrls);
  const response = await fetch(`${sharedConfig.url}/rest/v1/restaurant_edit_suggestions`, {
    method: "POST",
    headers: getSharedHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify({
      id: suggestionId,
      target_restaurant_id: targetRestaurant.id,
      name: restaurant.name,
      address: restaurant.address,
      area: restaurant.area,
      cuisine: restaurant.cuisine,
      price_range: restaurant.priceRange,
      notes: restaurant.notes,
      thumbnail_photo: thumbnailPhoto || null,
      photos: photoUrls,
    }),
  });

  if (!response.ok) {
    throw await getResponseError(
      response,
      "The edit could not be submitted. Ask the site owner to run the latest Supabase setup SQL.",
    );
  }
}

function isMissingThumbnailColumnError(error) {
  return error instanceof Error && error.message.includes("thumbnail_photo");
}

async function fetchSharedRestaurantRows(includeThumbnailPhoto) {
  const endpoint = new URL(`${sharedConfig.url}/rest/v1/restaurants`);
  const selectedColumns = [
    "id",
    "name",
    "address",
    "area",
    "cuisine",
    "best_for",
    "price_range",
    "walking_time",
    "foreigner_friendly",
    "map_link",
    "map_link_label",
    "notes",
    "photos",
    "created_at",
  ];

  if (includeThumbnailPhoto) {
    selectedColumns.splice(selectedColumns.indexOf("photos"), 0, "thumbnail_photo");
  }

  endpoint.searchParams.set("select", selectedColumns.join(","));
  endpoint.searchParams.set("status", "eq.approved");
  endpoint.searchParams.set("order", "created_at.asc");

  const response = await fetch(endpoint, { headers: getSharedHeaders() });

  if (!response.ok) {
    throw await getResponseError(response, "The shared restaurant list could not be loaded.");
  }

  return response.json();
}

async function loadSharedRestaurants() {
  if (!sharedConfig.enabled) {
    configureNewRestaurantForm();
    return;
  }

  try {
    const rows = await fetchSharedRestaurantRows(true);
    sharedRestaurants.splice(0, sharedRestaurants.length, ...rows.map(normalizeRestaurant));
    refreshRestaurants();
  } catch (error) {
    if (isMissingThumbnailColumnError(error)) {
      try {
        const rows = await fetchSharedRestaurantRows(false);
        sharedRestaurants.splice(0, sharedRestaurants.length, ...rows.map(normalizeRestaurant));
        refreshRestaurants();
        registrationMessage.textContent = "Run the latest Supabase setup SQL to enable saved card thumbnails.";
        return;
      } catch (fallbackError) {
        registrationMessage.textContent = `${fallbackError.message} You can still save places on this browser.`;
        return;
      }
    }

    registrationMessage.textContent = `${error.message} You can still save places on this browser.`;
  }
}

function clearThumbnailPicker() {
  thumbnailPreviewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
  thumbnailPreviewUrls = [];
  selectedThumbnailCandidate = null;
  restaurantThumbnailPicker.replaceChildren();
  restaurantThumbnailField.hidden = true;
}

function renderThumbnailPicker(candidates, helpText) {
  restaurantThumbnailPicker.replaceChildren();
  restaurantThumbnailField.hidden = candidates.length === 0;
  restaurantThumbnailHelp.textContent = helpText;

  candidates.forEach((candidate, index) => {
    const option = document.createElement("button");
    option.className = "thumbnail-option";
    option.type = "button";
    option.setAttribute("aria-pressed", String(candidate === selectedThumbnailCandidate));
    option.setAttribute("aria-label", `Use photo ${index + 1} as the card thumbnail`);

    const image = document.createElement("img");
    image.src = candidate.previewUrl;
    image.alt = `Thumbnail option ${index + 1}`;
    option.append(image);

    const label = document.createElement("span");
    label.textContent = `Photo ${index + 1}`;
    option.append(label);
    option.addEventListener("click", () => {
      selectedThumbnailCandidate = candidate;
      renderThumbnailPicker(candidates, helpText);
    });
    restaurantThumbnailPicker.append(option);
  });
}

function showExistingThumbnailPicker(restaurant) {
  clearThumbnailPicker();

  const photos = normalizePhotos(restaurant.photos);

  if (photos.length === 0) {
    return;
  }

  const candidates = photos.map((photo) => ({
    type: "existing",
    photo,
    previewUrl: photo,
  }));
  selectedThumbnailCandidate = candidates.find(
    (candidate) => candidate.photo === restaurant.thumbnailPhoto,
  ) || candidates[0];
  renderThumbnailPicker(candidates, "Choose the photo shown on this restaurant card.");
}

function showNewThumbnailPicker(fileList) {
  clearThumbnailPicker();

  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));

  if (files.length === 0) {
    if (editingRestaurant) {
      showExistingThumbnailPicker(editingRestaurant);
    }

    return;
  }

  const candidates = files.map((file, index) => {
    const previewUrl = URL.createObjectURL(file);
    thumbnailPreviewUrls.push(previewUrl);
    return {
      type: "new",
      index,
      previewUrl,
    };
  });
  selectedThumbnailCandidate = candidates[0];
  renderThumbnailPicker(candidates, "Choose the photo shown on this restaurant card after upload.");
}

function getThumbnailSelection() {
  return {
    thumbnailPhoto:
      selectedThumbnailCandidate?.type === "existing"
        ? selectedThumbnailCandidate.photo
        : "",
    thumbnailIndex:
      selectedThumbnailCandidate?.type === "new"
        ? selectedThumbnailCandidate.index
        : 0,
  };
}

function resolveThumbnailPhoto(restaurant, uploadedPhotos) {
  if (uploadedPhotos.length > 0) {
    const thumbnailIndex = Math.min(
      Math.max(Number(restaurant.thumbnailIndex) || 0, 0),
      uploadedPhotos.length - 1,
    );
    return uploadedPhotos[thumbnailIndex];
  }

  return isSafeImageUrl(restaurant.thumbnailPhoto) ? restaurant.thumbnailPhoto : "";
}

function openRestaurantForm() {
  configureNewRestaurantForm();
  openDialog(restaurantDialog);
}

function closeRestaurantForm() {
  closeDialog(restaurantDialog);
  configureNewRestaurantForm();
}

function setFormFieldValue(name, value) {
  const field = restaurantForm.elements.namedItem(name);

  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
    field.value = value || "";
  }
}

function getFormSubmitLabel() {
  if (editingRestaurant) {
    return sharedConfig.enabled ? "Submit edit for review" : "Save changes";
  }

  return sharedConfig.enabled ? "Submit for review" : "Add to my list";
}

function configureNewRestaurantForm() {
  editingRestaurant = null;
  restaurantForm.reset();
  clearThumbnailPicker();
  restaurantDialogLabel.textContent = "Add A Place";
  restaurantDialogTitle.textContent = "Share a restaurant";
  formIntro.textContent = sharedConfig.enabled
    ? "Share a place and photos with the community. New submissions are reviewed before they appear in the public guide."
    : "This guide is not connected to shared submissions yet. Places added here are saved only on this browser.";
  restaurantPhotoInput.required = true;
  restaurantPhotoHelp.textContent = "Choose up to 6 photos. The first one becomes the cover photo.";
  formSubmitButton.textContent = getFormSubmitLabel();
}

function openEditRestaurantForm(restaurant) {
  editingRestaurant = restaurant;
  restaurantForm.reset();
  setFormFieldValue("name", restaurant.name);
  setFormFieldValue("address", restaurant.address);
  setFormFieldValue("area", restaurant.area);
  setFormFieldValue("cuisine", restaurant.cuisine);
  setFormFieldValue("priceRange", restaurant.priceRange);
  setFormFieldValue("notes", restaurant.notes);
  showExistingThumbnailPicker(restaurant);
  restaurantDialogLabel.textContent = "Edit A Place";
  restaurantDialogTitle.textContent = `Edit ${restaurant.name || "restaurant"}`;
  formIntro.textContent = sharedConfig.enabled
    ? "Submit a correction for review. It will update the public guide after approval."
    : "Save a correction to this browser's copy of the guide.";
  restaurantPhotoInput.required = false;
  restaurantPhotoHelp.textContent = "Optional: choose up to 6 replacement photos. Leave blank to keep the current photos.";
  formSubmitButton.textContent = getFormSubmitLabel();
  openDialog(restaurantDialog);
}

function setSubmitting(isSubmitting) {
  formSubmitButton.disabled = isSubmitting;
  formSubmitButton.textContent = isSubmitting ? "Submitting..." : getFormSubmitLabel();
}

function saveEditedRestaurant(targetRestaurant, restaurant) {
  const updatedPhotos = restaurant.photos.length > 0 ? restaurant.photos : targetRestaurant.photos;
  const updatedRestaurant = normalizeRestaurant({
    ...targetRestaurant,
    ...restaurant,
    id: targetRestaurant.id,
    mapLink: "",
    mapLinkLabel: "",
    thumbnailPhoto: resolveThumbnailPhoto(restaurant, updatedPhotos),
    photos: updatedPhotos,
  });
  const savedIndex = savedRestaurants.findIndex(
    (savedRestaurant) => savedRestaurant.id === targetRestaurant.id,
  );

  if (savedIndex === -1) {
    savedRestaurants.push(updatedRestaurant);
  } else {
    savedRestaurants.splice(savedIndex, 1, updatedRestaurant);
  }

  if (saveRestaurants()) {
    refreshRestaurants();
    return true;
  }

  if (savedIndex === -1) {
    savedRestaurants.pop();
  } else {
    savedRestaurants.splice(savedIndex, 1, targetRestaurant);
  }

  return false;
}

async function handleRestaurantSubmission(event) {
  event.preventDefault();

  const targetRestaurant = editingRestaurant;
  const isEditing = Boolean(targetRestaurant);
  let photos = [];

  try {
    if (restaurantPhotoInput.files.length > 0) {
      photos = await preparePhotos(restaurantPhotoInput.files);
    } else if (!isEditing) {
      throw new Error("Choose at least one image file.");
    }
  } catch (error) {
    registrationMessage.textContent = error.message;
    return;
  }

  const formData = new FormData(restaurantForm);
  const restaurant = {
    id: createRestaurantId(),
    name: String(formData.get("name") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    area: normalizeArea(String(formData.get("area") || "")),
    cuisine: String(formData.get("cuisine") || "").trim(),
    priceRange: String(formData.get("priceRange") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
    photos,
    ...getThumbnailSelection(),
  };

  setSubmitting(true);

  try {
    if (sharedConfig.enabled) {
      if (targetRestaurant) {
        await submitRestaurantEditSuggestion(targetRestaurant, restaurant);
        closeRestaurantForm();
        registrationMessage.textContent = `Your edit for ${restaurant.name} was submitted for review.`;
        return;
      }

      await submitCommunityRestaurant(restaurant);
      closeRestaurantForm();
      registrationMessage.textContent = `${restaurant.name} was submitted for review. It will appear after approval.`;
      return;
    }

    if (targetRestaurant) {
      if (!saveEditedRestaurant(targetRestaurant, restaurant)) {
        registrationMessage.textContent = "The changes are too large to save in this browser. Try fewer or smaller photos.";
        return;
      }

      closeRestaurantForm();
      registrationMessage.textContent = `${restaurant.name} was updated in this browser.`;
      return;
    }

    savedRestaurants.push(restaurant);

    if (!saveRestaurants()) {
      savedRestaurants.pop();
      registrationMessage.textContent = "The photos are too large to save in this browser. Try fewer or smaller photos.";
      return;
    }

    refreshRestaurants();
    closeRestaurantForm();
    registrationMessage.textContent = `${restaurant.name} was added to this browser.`;
  } catch (error) {
    registrationMessage.textContent = `${error.message} Please try again.`;
  } finally {
    setSubmitting(false);
  }
}

openRestaurantDialog.addEventListener("click", openRestaurantForm);
closeRestaurantDialog.addEventListener("click", closeRestaurantForm);
cancelRestaurantDialog.addEventListener("click", closeRestaurantForm);
closePhotoGallery.addEventListener("click", () => closeDialog(photoGalleryDialog));
restaurantPhotoInput.addEventListener("change", () => {
  showNewThumbnailPicker(restaurantPhotoInput.files);
});
restaurantForm.addEventListener("submit", handleRestaurantSubmission);

refreshRestaurants();
loadSharedRestaurants();
