const axios = require("axios");
const logger = require("../utils/logger");

const GEO_API_URL = "https://api.openweathermap.org/geo/1.0/direct";
// Alterado para o endpoint gratuito da API de Clima Atual (v2.5)
const WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather";

const getCoordinates = async (city, state) => {
  console.log(`[DEBUG] Iniciando busca de coordenadas para: ${city}, ${state}`);
  try {
    const response = await axios.get(GEO_API_URL, {
      params: {
        q: `${city},${state},BR`,
        limit: 1,
        appid: process.env.OPENWEATHER_API_KEY,
      },
      timeout: 10000,
    });

    console.log("[DEBUG] Resposta da API de geolocalização:", response.data);

    if (response.data && response.data.length > 0) {
      const { lat, lon, name } = response.data[0];
      console.log(`[DEBUG] Coordenadas encontradas: Lat=${lat}, Lon=${lon}`);
      return { latitude: lat, longitude: lon, city: name };
    }
    logger.warn(`Nenhuma coordenada encontrada para ${city}, ${state}`);
    return null;
  } catch (error) {
    logger.error(
      `Erro ao buscar coordenadas para ${city}, ${state}.`,
      error.response ? error.response.data : error.message
    );
    console.log(
      "[DEBUG] Erro na chamada da API de geolocalização:",
      error.message
    );
    return null;
  }
};

const getWeather = async (city, state, cep) => {
  if (!city || !state) {
    logger.error("Cidade ou Estado não fornecidos para busca de clima.");
    console.log("[DEBUG] Cidade ou Estado ausentes.");
    return null;
  }

  console.log(`[DEBUG] Buscando clima para: ${city}, ${state}`);
  const coordinates = await getCoordinates(city, state);
  if (!coordinates) {
    console.log("[DEBUG] Não foi possível obter as coordenadas.");
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
    });

    console.log("[DEBUG] Resposta da API de clima:", response.data);

    const { main, weather } = response.data;

    if (!main || !weather || weather.length === 0) {
      logger.error("Resposta da API de clima está incompleta.");
      console.log("[DEBUG] Dados de clima incompletos na resposta da API.");
      return null;
    }

    // Adaptado para a estrutura de resposta da nova API
    const weatherData = {
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

    console.log("[DEBUG] Dados de clima processados:", weatherData);
    return weatherData;
  } catch (error) {
    logger.error(
      `Erro ao buscar previsão do tempo para ${coordinates.city}.`,
      error.response ? error.response.data : error.message
    );
    console.log("[DEBUG] Erro na chamada da API de clima:", error.message);
    return null;
  }
};

module.exports = {
  getWeather,
};