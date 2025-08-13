const axios = require("axios");
const logger = require("../utils/logger");

const GEO_API_URL = "http://api.openweathermap.org/geo/1.0/direct";
const WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/onecall";

const getCoordinates = async (city, state) => {
  try {
    const response = await axios.get(GEO_API_URL, {
      params: {
        q: `${city},${state},BR`,
        limit: 1,
        appid: process.env.OPENWEATHER_API_KEY,
      },
      timeout: 10000,
    });

    if (response.data && response.data.length > 0) {
      const { lat, lon, name } = response.data[0];
      return { latitude: lat, longitude: lon, city: name };
    }
    logger.warn(`Nenhuma coordenada encontrada para ${city}, ${state}`);
    return null;
  } catch (error) {
    logger.error(
      `Erro ao buscar coordenadas para ${city}, ${state}.`,
      error.response ? error.response.data : error.message
    );
    return null;
  }
};

const getWeather = async (city, state, cep) => {
  if (!city || !state) {
    logger.error("Cidade ou Estado não fornecidos para busca de clima.");
    return null;
  }

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
        exclude: "minutely,hourly,alerts",
      },
      timeout: 10000,
    });

    const { current, daily } = response.data;

    if (!current || !daily || daily.length === 0) {
      logger.error("Resposta da API de clima está incompleta.");
      return null;
    }

    return {
      current: {
        temperature_2m: current.temp,
        weather_code: current.weather[0].id,
      },
      daily: {
        temperature_2m_max: [daily[0].temp.max],
        temperature_2m_min: [daily[0].temp.min],
      },
      city: coordinates.city,
    };
  } catch (error) {
    logger.error(
      `Erro ao buscar previsão do tempo para ${coordinates.city}.`,
      error.response ? error.response.data : error.message
    );
    return null;
  }
};

module.exports = {
  getWeather,
};
