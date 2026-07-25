const restaurantList = document.querySelector("#restaurant-list");
const restaurantCount = document.querySelector("#restaurant-count");
const restaurants = Array.isArray(window.uosRestaurants) ? window.uosRestaurants : [];

const restaurantFields = [
  ["Best for", "bestFor"],
  ["Price range", "priceRange"],
  ["Walking time", "walkingTime"],
  ["Visitor-friendly", "foreignerFriendly"],
];

function addTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
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

renderRestaurants();
