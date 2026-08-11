import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as ctrl from '../controllers/user.controller.js';

const router = Router();

// Series del usuario
router.get('/series', asyncHandler(ctrl.listUserSeries));
router.get('/snapshot', asyncHandler(ctrl.getSnapshot));
router.post('/series/:seriesId', asyncHandler(ctrl.followSeries));
router.delete('/series/:seriesId', asyncHandler(ctrl.unfollowSeries));
router.post('/series/:seriesId/discard', asyncHandler(ctrl.discardSeries));
router.post('/series/:seriesId/follow', asyncHandler(ctrl.refollowSeries));

// Tomos
router.get('/pending', asyncHandler(ctrl.getPending));
router.get('/upcoming', asyncHandler(ctrl.getUpcoming));
router.get('/recent', asyncHandler(ctrl.getRecentVolumes));
router.get('/series/:seriesId/volumes', asyncHandler(ctrl.getSeriesVolumes));
router.post('/volumes', asyncHandler(ctrl.markVolume));
router.post('/volumes/bulk', asyncHandler(ctrl.markVolumesBulk));
router.delete('/volumes/:seriesId/:volumeNumber', asyncHandler(ctrl.unmarkVolume));

// Wishlist
router.get('/wishlist', asyncHandler(ctrl.getWishlist));
router.post('/wishlist/:seriesId', asyncHandler(ctrl.addToWishlist));
router.delete('/wishlist/:seriesId', asyncHandler(ctrl.removeFromWishlist));

// Estadísticas
router.get('/stats', asyncHandler(ctrl.getStats));
router.get('/statistics', asyncHandler(ctrl.getStatistics));

export default router;
