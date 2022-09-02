const https = require("https");
const awssdk = require("aws-sdk");

const WHEATHER_API_URL = "https://api.openweathermap.org";
const WHEATHER_API_UNITS = "metric";
const LAMBDA_CACHE_NAME = "OWTechTaskLayer2";
const REGION = "us-east-1";

const lambda = new awssdk.Lambda({
  region: REGION
});

exports.handler = async event => {
  try {
    const { city } = event;

    const paramsGet = {
      FunctionName: LAMBDA_CACHE_NAME,
      Payload: JSON.stringify({
        city,
        mode: "MODE_GET"
      })
    };

    const cacheRaw = await lambda.invoke(paramsGet).promise();
    const cacheParsed = JSON.parse(cacheRaw.Payload).body.cache;

    if (cacheParsed) {
      console.log(`Returning data from cache for city '${city}'...`);
      return { statusCode: 200, body: JSON.parse(cacheParsed) };
    }

    console.log(`Getting data from OpenWeather API for city '${city}'...`);

    const secretManagerClient = new awssdk.SecretsManager({
      apiVersion: "2017-10-17",
      region: REGION
    });

    const dataPromise = await secretManagerClient
      .getSecretValue({
        SecretId: "prod/OWTechTask/OWApiId"
      })
      .promise();

    const OWApiId = JSON.parse(dataPromise.SecretString).OWApiId;

    const cityDataString = await new Promise((resolve, reject) => {
      https.get(`${WHEATHER_API_URL}/geo/1.0/direct?q=${city}&limit=1&appid=${OWApiId}`, res => {
        let data = Buffer.from([]);

        res.on("data", chunk => {
          data += chunk;
        });
        res.on("end", () => {
          resolve(data);
        });
        res.on("error", err => {
          reject(err);
        });
      });
    });

    const cityDataArray = JSON.parse(cityDataString);

    if (!cityDataArray.length) {
      throw new Error(`City ${city} no found`);
    }

    // Array has only one item for city
    const cityData = cityDataArray[0];
    const { lat, lon } = cityData;

    const weatherDataString = await new Promise((resolve, reject) =>
      https.get(`${WHEATHER_API_URL}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${WHEATHER_API_UNITS}&appid=${OWApiId}`, res => {
        let data = Buffer.from([]);

        res.on("data", chunk => (data += chunk));

        res.on("end", () => {
          resolve(data);
        });

        res.on("error", err => reject(err));
      })
    );
    const weatherData = JSON.parse(weatherDataString);

    const { temp, pressure, humidity } = weatherData.main;

    const response = {
      city,
      temperature: temp,
      condition: weatherData.weather[0].description,
      wind: weatherData.wind.speed,
      pressure,
      humidity
    };

    const paramsSet = {
      FunctionName: LAMBDA_CACHE_NAME,
      Payload: JSON.stringify({
        city,
        mode: "MODE_SET",
        weather: response
      })
    };

    // Set wheather info for city to cache
    await lambda.invoke(paramsSet).promise();

    return { statusCode: 200, body: response };
  } catch (err) {
    console.error("Error:", err);
    return { succsess: false, reason: err.message };
  }
};
