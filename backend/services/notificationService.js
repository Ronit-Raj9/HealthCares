import Notification from '../models/notification.model.js';
import Patient from '../models/patient.model.js';
import Doctor from '../models/doctor.model.js';

class NotificationService {
    /**
     * Create a notification and add it to the user's notification array
     * @param {string} userId - The user ID
     * @param {string} userType - 'patient' or 'doctor'
     * @param {string} message - Notification message
     * @param {string} type - Notification type
     * @param {string} relatedId - Related entity ID (optional)
     * @param {string} priority - Priority level (optional)
     */
    static async createNotification(userId, userType, message, type, relatedId = null, priority = 'medium') {
        try {
            // Create the notification
            const notification = await Notification.create({
                userId,
                userType,
                message,
                type,
                relatedId,
                priority
            });

            // Add notification to user's notification array
            if (userType === 'patient') {
                const patient = await Patient.findById(userId);
                if (patient) {
                    patient.notifications.push({
                        _id: notification._id,
                        message: notification.message,
                        isRead: false
                    });
                    await patient.save();
                }
            } else if (userType === 'doctor') {
                const doctor = await Doctor.findById(userId);
                if (doctor) {
                    doctor.notifications.push({
                        _id: notification._id,
                        message: notification.message,
                        isRead: false
                    });
                    await doctor.save();
                }
            }

            return notification;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }

    /**
     * Create appointment-related notifications
     */
    static async createAppointmentNotification(patientId, doctorId, appointmentId, appointmentDate, type) {
        try {
            const patient = await Patient.findById(patientId);
            const doctor = await Doctor.findById(doctorId);

            if (!patient || !doctor) {
                throw new Error('Patient or doctor not found');
            }

            const formattedDate = new Date(appointmentDate).toLocaleDateString();
            const formattedTime = new Date(appointmentDate).toLocaleTimeString();

            let patientMessage, doctorMessage;

            switch (type) {
                case 'appointment':
                    patientMessage = `Your appointment request with Dr. ${doctor.name} on ${formattedDate} at ${formattedTime} has been submitted successfully.`;
                    doctorMessage = `New appointment request from ${patient.name} for ${formattedDate} at ${formattedTime}.`;
                    break;
                case 'appointment_confirmation':
                    patientMessage = `Your appointment with Dr. ${doctor.name} on ${formattedDate} at ${formattedTime} has been confirmed.`;
                    doctorMessage = `Appointment with ${patient.name} on ${formattedDate} at ${formattedTime} has been confirmed.`;
                    break;
                case 'appointment_rejection':
                    patientMessage = `Your appointment request with Dr. ${doctor.name} on ${formattedDate} at ${formattedTime} has been rejected.`;
                    doctorMessage = `Appointment request from ${patient.name} for ${formattedDate} at ${formattedTime} has been rejected.`;
                    break;
                case 'appointment_cancellation':
                    patientMessage = `Your appointment with Dr. ${doctor.name} on ${formattedDate} at ${formattedTime} has been cancelled.`;
                    doctorMessage = `Appointment with ${patient.name} on ${formattedDate} at ${formattedTime} has been cancelled.`;
                    break;
                default:
                    throw new Error('Invalid appointment notification type');
            }

            // Create notifications for both patient and doctor
            await Promise.all([
                this.createNotification(patientId, 'patient', patientMessage, type, appointmentId),
                this.createNotification(doctorId, 'doctor', doctorMessage, type, appointmentId)
            ]);

        } catch (error) {
            console.error('Error creating appointment notification:', error);
            throw error;
        }
    }

    /**
     * Create profile update notification
     */
    static async createProfileUpdateNotification(userId, userType, fieldName) {
        try {
            const message = `Your ${fieldName} has been updated successfully.`;
            await this.createNotification(userId, userType, message, 'profile_update');
        } catch (error) {
            console.error('Error creating profile update notification:', error);
            throw error;
        }
    }

    /**
     * Create password change notification
     */
    static async createPasswordChangeNotification(userId, userType) {
        try {
            const message = 'Your password has been changed successfully. If this was not you, please contact support immediately.';
            await this.createNotification(userId, userType, message, 'password_change', null, 'high');
        } catch (error) {
            console.error('Error creating password change notification:', error);
            throw error;
        }
    }

    /**
     * Create access request notifications
     */
    static async createAccessRequestNotification(patientId, doctorId, requestId, action) {
        try {
            const patient = await Patient.findById(patientId);
            const doctor = await Doctor.findById(doctorId);

            if (!patient || !doctor) {
                throw new Error('Patient or doctor not found');
            }

            let patientMessage, doctorMessage;

            switch (action) {
                case 'requested':
                    patientMessage = `Dr. ${doctor.name} has requested access to your medical records.`;
                    doctorMessage = `Access request sent to ${patient.name} for medical records.`;
                    break;
                case 'granted':
                    patientMessage = `You have granted access to your medical records to Dr. ${doctor.name}.`;
                    doctorMessage = `${patient.name} has granted you access to their medical records.`;
                    break;
                case 'denied':
                    patientMessage = `You have denied access to your medical records to Dr. ${doctor.name}.`;
                    doctorMessage = `${patient.name} has denied your request for medical records access.`;
                    break;
                default:
                    throw new Error('Invalid access request action');
            }

            await Promise.all([
                this.createNotification(patientId, 'patient', patientMessage, `access_${action}`, requestId),
                this.createNotification(doctorId, 'doctor', doctorMessage, `access_${action}`, requestId)
            ]);

        } catch (error) {
            console.error('Error creating access request notification:', error);
            throw error;
        }
    }

    /**
     * Get notifications for a user
     */
    static async getUserNotifications(userId, userType, limit = 50) {
        try {
            const notifications = await Notification.find({ 
                userId, 
                userType 
            })
            .sort({ createdAt: -1 })
            .limit(limit);

            return notifications;
        } catch (error) {
            console.error('Error fetching user notifications:', error);
            throw error;
        }
    }

    /**
     * Get unread notification count for a user
     */
    static async getUnreadCount(userId, userType) {
        try {
            const count = await Notification.countDocuments({ 
                userId, 
                userType, 
                isRead: false 
            });
            return count;
        } catch (error) {
            console.error('Error fetching unread count:', error);
            throw error;
        }
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(notificationId, userId, userType) {
        try {
            const notification = await Notification.findById(notificationId);
            if (!notification) {
                throw new Error('Notification not found');
            }

            if (notification.userId !== userId) {
                throw new Error('Unauthorized to mark this notification as read');
            }

            notification.isRead = true;
            await notification.save();

            // Update user's notification array
            if (userType === 'patient') {
                const patient = await Patient.findById(userId);
                if (patient) {
                    patient.notifications = patient.notifications.map(notif =>
                        notif._id.toString() === notificationId 
                            ? { ...notif, isRead: true } 
                            : notif
                    );
                    await patient.save();
                }
            } else if (userType === 'doctor') {
                const doctor = await Doctor.findById(userId);
                if (doctor) {
                    doctor.notifications = doctor.notifications.map(notif =>
                        notif._id.toString() === notificationId 
                            ? { ...notif, isRead: true } 
                            : notif
                    );
                    await doctor.save();
                }
            }

            return notification;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    }

    /**
     * Mark all notifications as read for a user
     */
    static async markAllAsRead(userId, userType) {
        try {
            await Notification.updateMany(
                { userId, userType, isRead: false },
                { isRead: true }
            );

            // Update user's notification array
            if (userType === 'patient') {
                const patient = await Patient.findById(userId);
                if (patient) {
                    patient.notifications = patient.notifications.map(notif => ({
                        ...notif,
                        isRead: true
                    }));
                    await patient.save();
                }
            } else if (userType === 'doctor') {
                const doctor = await Doctor.findById(userId);
                if (doctor) {
                    doctor.notifications = doctor.notifications.map(notif => ({
                        ...notif,
                        isRead: true
                    }));
                    await doctor.save();
                }
            }
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            throw error;
        }
    }
}

export default NotificationService;
