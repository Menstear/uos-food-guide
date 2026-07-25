const restaurantList = document.querySelector("#restaurant-list");
const restaurantCount = document.querySelector("#restaurant-count");
const restaurantDialog = document.querySelector("#restaurant-dialog");
const restaurantForm = document.querySelector("#restaurant-form");
const openRestaurantDialog = document.querySelector("#open-restaurant-dialog");
const closeRestaurantDialog = document.querySelector("#close-restaurant-dialog");
const cancelRestaurantDialog = document.querySelector("#cancel-restaurant-dialog");
const registrationMessage = document.querySelector("#registration-message");
const savedRestaurantsKey = "uosFoodGuideSavedRestaurants";
const publishedRestaurants = Array.isArray(window.uosRestaurants) ? window.uosRestaurants : [];
const savedRestaurants = loadSavedRestaurants();
const restaurants = [...publishedRestaurants, ...savedRestaurants];

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

function loadSavedRestaurants() {
  try {
    const storedRestaurants = window.localStorage.getItem(savedRestaurantsKey);
    const parsedRestaurants = JSON.parse(storedRestaurants || "[]");

    return Array.isArray(parsedRestaurants) ? parsedRestaurants : [];
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

function createRestaurantCard(restaurant) {
  const card = document.createElement("article");
  card.className = "restaurant-card";

  addTextElement(card, "p", "card-label", restaurant.cuisine || "Restaurant");
  addTextElement(card, "h3", "restaurant-name", restaurant.name || "Unnamed restaurant");

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

  card.append(details);

  if (restaurant.notes) {
    addTextElement(card, "p", "restaurant-notes", restaurant.notes);
  }

  if (isSafeMapUrl(restaurant.googleMapsLink)) {
    const mapLink = document.createElement("a");
    mapLink.className = "map-link";
    mapLink.href = restaurant.googleMapsLink;
    mapLink.target = "_blank";
    mapLink.rel = "noreferrer";
    mapLink.textContent = "View on Google Maps";
    card.append(mapLink);
  }

  return card;
}

function renderRestaurants() {
  restaurantList.replaceChildren();
  restaurantCount.textContent = String(restaurants.length);

  if (restaurants.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "restaurant-empty";
    addTextElement(emptyState, "h3", "", "No restaurants added yet");
    addTextElement(
      emptyState,
      "p",
      "",
      "The guide will grow as new recommendations are added.",
    );
    restaurantList.append(emptyState);
    return;
  }

  restaurants.forEach((restaurant) => {
    restaurantList.append(createRestaurantCard(restaurant));
  });
}

function openDialog() {
  if (typeof restaurantDialog.showModal === "function") {
    restaurantDialog.showModal();
    return;
  }

  restaurantDialog.setAttribute("open", "");
}

function closeDialog() {
  if (typeof restaurantDialog.close === "function") {
    restaurantDialog.close();
    return;
  }

  restaurantDialog.removeAttribute("open");
}

function handleRestaurantSubmission(event) {
  event.preventDefault();

  const formData = new FormData(restaurantForm);
  const restaurant = {
    name: String(formData.get("name") || "").trim(),
    address: String(formData.get("address") || "").trim(),
    cuisine: String(formData.get("cuisine") || "").trim(),
    priceRange: String(formData.get("priceRange") || "").trim(),
  };

  savedRestaurants.push(restaurant);
  restaurants.push(restaurant);
  const saved = saveRestaurants();

  renderRestaurants();
  restaurantForm.reset();
  closeDialog();
  registrationMessage.textContent = saved
    ? `${restaurant.name} was added to this browser.`
    : `${restaurant.name} was added for this visit only.`;
}

openRestaurantDialog.addEventListener("click", openDialog);
closeRestaurantDialog.addEventListener("click", closeDialog);
cancelRestaurantDialog.addEventListener("click", closeDialog);
restaurantForm.addEventListener("submit", handleRestaurantSubmission);

renderRestaurants();
