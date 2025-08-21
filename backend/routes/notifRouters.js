import Router from 'express';
import { 
    readNotification, 
    markAllAsRead, 
    getUserNotifications, 
    getUnreadCount, 
    deleteNotification, 
    deleteAllNotifications,
    numberOfUnreadNotifications 
} from '../controllers/notif.controllers.js';

const notificationRouter = Router();

// Mark single notification as read
notificationRouter.route('/:notificationId/:_id/read').put(readNotification);

// Mark all notifications as read
notificationRouter.route('/:_id/mark-all-read').put(markAllAsRead);

// Get all notifications for a user
notificationRouter.route('/:_id').get(getUserNotifications);

// Get unread notification count
notificationRouter.route('/:_id/unread-count').get(getUnreadCount);

// Delete a single notification
notificationRouter.route('/:notificationId/:_id').delete(deleteNotification);

// Delete all notifications for a user
notificationRouter.route('/:_id/delete-all').delete(deleteAllNotifications);

// Legacy route for backward compatibility
notificationRouter.route('/:userId/unread').get(numberOfUnreadNotifications);

export default notificationRouter;