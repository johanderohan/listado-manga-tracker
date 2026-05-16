import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as ctrl from '../controllers/series.controller.js';

const router = Router();

router.get('/', asyncHandler(ctrl.listSeries));
router.get('/search', asyncHandler(ctrl.searchSeriesRemote));
router.get('/:id', asyncHandler(ctrl.getSeriesDetail));
router.post('/sync', asyncHandler(ctrl.syncSeries));
router.post('/:id/refresh', asyncHandler(ctrl.refreshSeries));
router.post('/refresh-all', asyncHandler(ctrl.refreshAllSeries));

export default router;
