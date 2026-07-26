const restaurantGroups = document.querySelector("#restaurant-groups");
const restaurantCount = document.querySelector("#restaurant-count");
const restaurantDialog = document.querySelector("#restaurant-dialog");
const restaurantForm = document.querySelector("#restaurant-form");
const restaurantPhotoInput = document.querySelector("#restaurant-photos");
const openRestaurantDialog = document.querySelector("#open-restaurant-dialog");
const closeRestaurantDialog = document.querySelector("#close-restaurant-dialog");
const cancelRestaurantDialog = document.querySelector("#cancel-restaurant-dialog");
const registrationMessage = document.querySelector("#registration-message");
const formIntro = document.querySelector(".form-intro");
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
  photo.src = photos[0];
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

function renderRestaurants() {
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

      previousButton.addEventListener("click", () => scrollCards(-1));
      nextButton.addEventListener("click", () => scrollCards(1));
      controls.append(previousButton, nextButton);
      areaMeta.append(controls);
    }

    areaSection.append(heading, areaGrid);
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
      photos: photoUrls,
    }),
  });

  if (!response.ok) {
    throw await getResponseError(response, "The restaurant could not be submitted.");
  }
}

async function loadSharedRestaurants() {
  if (!sharedConfig.enabled) {
    formIntro.textContent = "This guide is not connected to shared submissions yet. Places added here are saved only on this browser.";
    formSubmitButton.textContent = "Add to my list";
    return;
  }

  const endpoint = new URL(`${sharedConfig.url}/rest/v1/restaurants`);
  endpoint.searchParams.set(
    "select",
    "id,name,address,area,cuisine,best_for,price_range,walking_time,foreigner_friendly,map_link,map_link_label,notes,photos,created_at",
  );
  endpoint.searchParams.set("status", "eq.approved");
  endpoint.searchParams.set("order", "created_at.asc");

  try {
    const response = await fetch(endpoint, { headers: getSharedHeaders() });

    if (!response.ok) {
      throw await getResponseError(response, "The shared restaurant list could not be loaded.");
    }

    const rows = await response.json();
    sharedRestaurants.splice(0, sharedRestaurants.length, ...rows.map(normalizeRestaurant));
    refreshRestaurants();
  } catch (error) {
    registrationMessage.textContent = `${error.message} You can still save places on this browser.`;
  }
}

function openRestaurantForm() {
  openDialog(restaurantDialog);
}

function closeRestaurantForm() {
  closeDialog(restaurantDialog);
}

function setSubmitting(isSubmitting) {
  formSubmitButton.disabled = isSubmitting;
  formSubmitButton.textContent = isSubmitting
    ? "Submitting..."
    : sharedConfig.enabled
      ? "Submit for review"
      : "Add to my list";
}

async function handleRestaurantSubmission(event) {
  event.preventDefault();

  let photos;

  try {
    photos = await preparePhotos(restaurantPhotoInput.files);
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
    photos,
  };

  setSubmitting(true);

  try {
    if (sharedConfig.enabled) {
      await submitCommunityRestaurant(restaurant);
      restaurantForm.reset();
      closeRestaurantForm();
      registrationMessage.textContent = `${restaurant.name} was submitted for review. It will appear after approval.`;
      return;
    }

    savedRestaurants.push(restaurant);

    if (!saveRestaurants()) {
      savedRestaurants.pop();
      registrationMessage.textContent = "The photos are too large to save in this browser. Try fewer or smaller photos.";
      return;
    }

    refreshRestaurants();
    restaurantForm.reset();
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
restaurantForm.addEventListener("submit", handleRestaurantSubmission);

refreshRestaurants();
loadSharedRestaurants();
