const axios = require("axios");
const logger = require("../utils/logger");

const GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";

const getCoordinates = async (city, state, cep) => {
  const params = {
    name: cep || city,
    count: 10,
    language: "pt",
    format: "json",
  };

  try {
    const response = await axios.get(GEOCODING_API_URL, { params });

    if (!response.data.results) return null;

    let location = response.data.results.find((r) => r.country_code === "BR");

    if (
      location &&
      state &&
      location.admin1 &&
      location.admin1.toLowerCase() !== state.toLowerCase()
    ) {
      const stateMatch = response.data.results.find(
        (r) =>
          r.country_code === "BR" &&
          r.admin1 &&
          r.admin1.toLowerCase() === state.toLowerCase()
      );
      if (stateMatch) location = stateMatch;
    }

    return location
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          city: location.name,
        }
      : null;
  } catch (error) {
    logger.error("Erro ao buscar coordenadas:", error);
    return null;
  }
};

const getWeather = async (city, state, cep) => {
  const coordinates = await getCoordinates(city, state, cep);
  if (!coordinates) {
    return null;
  }

  try {
    const response = await axios.get(WEATHER_API_URL, {
      params: {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        current: "temperature_2m,weather_code",
        daily: "weather_code,temperature_2m_max,temperature_2m_min",
        timezone: "America/Sao_Paulo",
      },
    });

    return {
      ...response.data,
      city: coordinates.city,
    };
  } catch (error) {
    logger.error("Erro ao buscar previsão do tempo:", error);
    return null;
  }
};

module.exports = {
  getWeather,
};
