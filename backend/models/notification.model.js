import mongoose,{Schema} from 'mongoose';

const notificationSchema = new Schema({
    userId: {
        type: String,
        required: true
    },
    userType: {
        type: String,
        enum: ['patient', 'doctor'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['appointment', 'appointment_confirmation', 'appointment_rejection', 'appointment_cancellation', 'profile_update', 'password_change', 'report', 'access_request', 'access_granted', 'access_denied', 'general'],
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    relatedId: {
        type: String, // For storing related appointment ID, report ID, etc.
        default: null
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for better query performance
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;