const axios = require("axios");
const logger = require("../utils/logger");

const GEO_API_URL = "http://api.openweathermap.org/geo/1.0/direct";
const WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather";

const getCoordinates = async (city, state) => {
  try {
    const response = await axios.get(GEO_API_URL, {
      params: {
        q: `${city},${state},BR`,
        limit: 1,
        appid: process.env.OPENWEATHER_API_KEY,
      },
      timeout: 10000,
      family: 4,
    });

    if (response.data && response.data.length > 0) {
      const { lat, lon } = response.data[0];
      return { latitude: lat, longitude: lon, city: response.data[0].name };
    }
    return null;
  } catch (error) {
    logger.error("Erro ao buscar coordenadas na OpenWeather.", error);
    return null;
  }
};

const getWeather = async (city, state) => {
  const coordinates = await getCoordinates(city, state);
  if (!coordinates) {
    return null;
  }

  try {
    const response = await axios.get(WEATHER_API_URL, {
      params: {
        lat: coordinates.latitude,
        lon: coordinates.longitude,
        appid: process.env.OPENWEATHER_API_KEY,
        units: "metric",
        lang: "pt_br",
      },
      timeout: 10000,
      family: 4,
    });

    const { main, weather } = response.data;
    return {
      current: {
        temperature_2m: main.temp,
        weather_code: weather[0].id,
      },
      daily: {
        temperature_2m_max: [main.temp_max],
        temperature_2m_min: [main.temp_min],
      },
      city: coordinates.city,
    };
  } catch (error) {
    logger.error("Erro ao buscar previsão do tempo na OpenWeather.", error);
    return null;
  }
};

module.exports = {
  getWeather,
};