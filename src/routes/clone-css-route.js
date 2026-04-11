import { Router } from 'express';
import { getCloneCss } from '../utils/homepage-template.js';

export function createCloneCssRouter() {
  const router = Router();

  router.get(['/clone.css', '/api/clone-css'], (_request, response) => {
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.type('text/css').send(getCloneCss());
  });

  return router;
}
