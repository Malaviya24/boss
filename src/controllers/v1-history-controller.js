import { successResponse } from '../utils/response.js';

export function createV1HistoryController(store) {
  return (_request, response) => {
    response.json(successResponse(store.getHistory(), 'Fetched market history'));
  };
}
