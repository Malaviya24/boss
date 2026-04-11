import { successResponse } from '../utils/response.js';

export function createV1AllController(store) {
  return (_request, response) => {
    response.json(successResponse(store.getAllRecords(), 'Fetched all markets'));
  };
}
