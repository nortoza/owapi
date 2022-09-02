const https = require("https");
const awssdk = require("aws-sdk");
const redis = require('ioredis');

const TTL = 60; // seconds

exports.handler = async (event) => {
  try {
    const { city, mode, weather } = event;

    const redisClient = redis.createClient({
      host: 'weathercache.yz1v98.ng.0001.use1.cache.amazonaws.com',
      port: 6379
    });

    if (mode === 'MODE_GET') {
      const cachedData = await redisClient.get(city);

      console.log('Cached data:', cachedData, typeof cachedData)

      return {
        statusCode: 200, body: { cache: cachedData ?? false }
      }
    }

    // Setting record to cache with 
    await redisClient.set(city, JSON.stringify(weather), 'ex', TTL);

    return {
      statusCode: 200, body: { status: true }
    }
  } catch (err) {
    console.error('Error:', err);
    return { succsess: false, reason: err.message };
  }
};
