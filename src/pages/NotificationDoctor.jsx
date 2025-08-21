import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import fetchData from "../helper/authApi";
import Loading from "../components/Loading";
import Empty from "../components/Empty";
import { useDispatch, useSelector } from "react-redux";
import { setLoading } from "../redux/reducers/rootSlice";
import { setUserInfo } from "../redux/reducers/rootSlice";
import "../styles/users.css";
import "../styles/notif.css";
import toast from "react-hot-toast";

const NotificationDoctor = () => {
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.root);
  let { userInfo } = useSelector((state) => state.root);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notifications from API
  const fetchNotifications = async () => {
    try {
      dispatch(setLoading(true));
      console.log("fetching noti")
      const response = await fetchData(
        `http://localhost:5000/api/notifications/${userInfo._id}`
      );
      
      if (response?.data) {
        setNotifications(response.data);
        // Update userInfo with fresh notifications
        const updatedUserInfo = { ...userInfo, notifications: response.data };
        dispatch(setUserInfo(updatedUserInfo));
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
      toast.error("Failed to fetch notifications");
    } finally {
      dispatch(setLoading(false));
    }
  };

  // Fetch unread count
  const fetchUnreadCount = async () => {
    try {
      const response = await fetchData(
        `http://localhost:5000/api/notifications/${userInfo._id}/unread-count`
      );
      
      if (response?.data?.unreadCount !== undefined) {
        setUnreadCount(response.data.unreadCount);
      }
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      await fetchData(
        `http://localhost:5000/api/notifications/${notificationId}/${userInfo._id}/read`,
        "PUT"
      );
      
      // Update local state
      const updatedNotifications = notifications.map((notification) =>
        notification._id === notificationId 
          ? { ...notification, isRead: true } 
          : notification
      );
      setNotifications(updatedNotifications);
      
      // Update userInfo
      const updatedUserInfo = { ...userInfo, notifications: updatedNotifications };
      dispatch(setUserInfo(updatedUserInfo));
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      toast.success("Notification marked as read");
    } catch (error) {
      console.error("Error marking notification as read:", error);
      toast.error("Failed to mark as read");
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      await fetchData(
        `http://localhost:5000/api/notifications/${userInfo._id}/mark-all-read`,
        "PUT"
      );
      
      // Update local state
      const updatedNotifications = notifications.map(notification => ({
        ...notification,
        isRead: true
      }));
      setNotifications(updatedNotifications);
      
      // Update userInfo
      const updatedUserInfo = { ...userInfo, notifications: updatedNotifications };
      dispatch(setUserInfo(updatedUserInfo));
      
      // Update unread count
      setUnreadCount(0);
      
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      toast.error("Failed to mark all as read");
    }
  };

  // Delete a notification
  const deleteNotification = async (notificationId) => {
    try {
      await fetchData(
        `http://localhost:5000/api/notifications/${notificationId}/${userInfo._id}`,
        "DELETE"
      );
      
      // Update local state
      const updatedNotifications = notifications.filter(
        notification => notification._id !== notificationId
      );
      setNotifications(updatedNotifications);
      
      // Update userInfo
      const updatedUserInfo = { ...userInfo, notifications: updatedNotifications };
      dispatch(setUserInfo(updatedUserInfo));
      
      // Update unread count if notification was unread
      const deletedNotification = notifications.find(n => n._id === notificationId);
      if (deletedNotification && !deletedNotification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      toast.success("Notification deleted");
    } catch (error) {
      console.error("Error deleting notification:", error);
      toast.error("Failed to delete notification");
    }
  };

  // Delete all notifications
  const deleteAllNotifications = async () => {
    if (!window.confirm("Are you sure you want to delete all notifications?")) {
      return;
    }
    
    try {
      await fetchData(
        `http://localhost:5000/api/notifications/${userInfo._id}/delete-all`,
        "DELETE"
      );
      
      // Update local state
      setNotifications([]);
      
      // Update userInfo
      const updatedUserInfo = { ...userInfo, notifications: [] };
      dispatch(setUserInfo(updatedUserInfo));
      
      // Update unread count
      setUnreadCount(0);
      
      toast.success("All notifications deleted");
    } catch (error) {
      console.error("Error deleting all notifications:", error);
      toast.error("Failed to delete all notifications");
    }
  };

  // Get notification icon based on type
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'appointment':
      case 'appointment_confirmation':
      case 'appointment_rejection':
      case 'appointment_cancellation':
        return '📅';
      case 'profile_update':
        return '👤';
      case 'password_change':
        return '🔒';
      case 'access_request':
      case 'access_granted':
      case 'access_denied':
        return '🔐';
      case 'report':
        return '📋';
      default:
        return '📢';
    }
  };

  // Get notification priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'high-priority';
      case 'medium':
        return 'medium-priority';
      case 'low':
        return 'low-priority';
      default:
        return 'medium-priority';
    }
  };

  useEffect(() => {
    if (userInfo?._id) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [userInfo?._id]);

  if (loading) {
    return <Loading />;
  }

  return (
    <>
      <Navbar />
      <section className="container notif-section">
        <div className="notification-header">
          <h2 className="page-heading">Your Notifications</h2>
          <div className="notification-actions">
            {unreadCount > 0 && (
              <button
                className="btn user-btn mark-all-read-btn"
                onClick={markAllAsRead}
              >
                Mark All as Read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                className="btn user-btn delete-all-btn"
                onClick={deleteAllNotifications}
              >
                Delete All
              </button>
            )}
          </div>
        </div>

        {notifications.length > 0 ? (
          <div className="notifications">
            <div className="notification-list">
              {notifications.map((notification, index) => (
                <div
                  key={notification._id}
                  className={`notification-item ${!notification.isRead ? 'unread' : ''} ${getPriorityColor(notification.priority)}`}
                >
                  <div className="notification-content">
                    <div className="notification-icon">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="notification-details">
                      <p className="notification-message">{notification.message}</p>
                      <div className="notification-meta">
                        <span className="notification-type">{notification.type.replace('_', ' ')}</span>
                        <span className="notification-time">
                          {new Date(notification.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="notification-actions">
                    {!notification.isRead && (
                      <button
                        className="btn user-btn mark-read-btn"
                        onClick={() => markAsRead(notification._id)}
                      >
                        Mark as Read
                      </button>
                    )}
                    <button
                      className="btn user-btn delete-btn"
                      onClick={() => deleteNotification(notification._id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Empty />
        )}
      </section>
      <Footer />
    </>
  );
};

export default NotificationDoctor;
