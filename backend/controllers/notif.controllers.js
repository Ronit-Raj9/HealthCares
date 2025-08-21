import Notification from '../models/notification.model.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import Patient from '../models/patient.model.js';
import Doctor from '../models/doctor.model.js';
import NotificationService from '../services/notificationService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Mark a single notification as read
export const readNotification = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    const { _id } = req.params;
    
    if (!notificationId) {
        throw new ApiError(400, "Notification ID is required");
    }
    
    const patient = await Patient.findById(_id);
    const doctor = await Doctor.findById(_id);
    
    if (!patient && !doctor) {
        throw new ApiError(404, "User not found");
    }
    
    const userType = patient ? 'patient' : 'doctor';
    const notification = await NotificationService.markAsRead(notificationId, _id, userType);
    
    return res.status(200).json(
        new ApiResponse(200, notification, "Notification marked as read")
    );
});

// Mark all notifications as read for a user
export const markAllAsRead = asyncHandler(async (req, res) => {
    const { _id } = req.params;
    
    const patient = await Patient.findById(_id);
    const doctor = await Doctor.findById(_id);
    
    if (!patient && !doctor) {
        throw new ApiError(404, "User not found");
    }
    
    const userType = patient ? 'patient' : 'doctor';
    await NotificationService.markAllAsRead(_id, userType);
    
    return res.status(200).json(
        new ApiResponse(200, {}, "All notifications marked as read")
    );
});

// Get all notifications for a user
export const getUserNotifications = asyncHandler(async (req, res) => {
    const { _id } = req.params;
    const { limit = 50, page = 1 } = req.query;
    
    const patient = await Patient.findById(_id);
    const doctor = await Doctor.findById(_id);
    
    if (!patient && !doctor) {
        throw new ApiError(404, "User not found");
    }
    
    const userType = patient ? 'patient' : 'doctor';
    const notifications = await NotificationService.getUserNotifications(_id, userType, parseInt(limit));
    
    return res.status(200).json(
        new ApiResponse(200, notifications, "Notifications retrieved successfully")
    );
});

// Get unread notification count
export const getUnreadCount = asyncHandler(async (req, res) => {
    const { _id } = req.params;
    
    const patient = await Patient.findById(_id);
    const doctor = await Doctor.findById(_id);
    
    if (!patient && !doctor) {
        throw new ApiError(404, "User not found");
    }
    
    const userType = patient ? 'patient' : 'doctor';
    const unreadCount = await NotificationService.getUnreadCount(_id, userType);
    
    return res.status(200).json(
        new ApiResponse(200, { unreadCount }, "Unread count retrieved successfully")
    );
});

// Delete a notification
export const deleteNotification = asyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    const { _id } = req.params;
    
    if (!notificationId) {
        throw new ApiError(400, "Notification ID is required");
    }
    
    const patient = await Patient.findById(_id);
    const doctor = await Doctor.findById(_id);
    
    if (!patient && !doctor) {
        throw new ApiError(404, "User not found");
    }
    
    const notification = await Notification.findById(notificationId);
    if (!notification) {
        throw new ApiError(404, "Notification not found");
    }
    
    if (notification.userId !== _id) {
        throw new ApiError(403, "Unauthorized to delete this notification");
    }
    
    // Remove from user's notification array
    if (patient) {
        patient.notifications = patient.notifications.filter(
            notif => notif._id.toString() !== notificationId
        );
        await patient.save();
    } else if (doctor) {
        doctor.notifications = doctor.notifications.filter(
            notif => notif._id.toString() !== notificationId
        );
        await doctor.save();
    }
    
    await Notification.findByIdAndDelete(notificationId);
    
    return res.status(200).json(
        new ApiResponse(200, {}, "Notification deleted successfully")
    );
});

// Delete all notifications for a user
export const deleteAllNotifications = asyncHandler(async (req, res) => {
    const { _id } = req.params;
    
    const patient = await Patient.findById(_id);
    const doctor = await Doctor.findById(_id);
    
    if (!patient && !doctor) {
        throw new ApiError(404, "User not found");
    }
    
    const userType = patient ? 'patient' : 'doctor';
    
    // Clear user's notification array
    if (patient) {
        patient.notifications = [];
        await patient.save();
    } else if (doctor) {
        doctor.notifications = [];
        await doctor.save();
    }
    
    // Delete all notifications from database
    await Notification.deleteMany({ userId: _id, userType });
    
    return res.status(200).json(
        new ApiResponse(200, {}, "All notifications deleted successfully")
    );
});

// Legacy function for backward compatibility
export const numberOfUnreadNotifications = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            throw new ApiError(400, "User ID is required");
        }

        const notifications = await Notification.find({ userId, isRead: false });
        const unreadCount = notifications.length;

        return res.status(200).json(
            new ApiResponse(200, { unreadCount }, "Unread notifications count retrieved successfully")
        );
    } catch (error) {
        return res.status(error.statusCode || 500).json(
            new ApiError(error.statusCode || 500, error.message || "Server Error")
        );
    }
};

