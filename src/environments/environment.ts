const isProduction = window.location.hostname !== 'localhost';

export const environment = {
  production: isProduction,
  apiUrl: isProduction
    ? 'https://hangout-a-social-event-media-production.up.railway.app'
    : 'http://localhost:3000',
};
