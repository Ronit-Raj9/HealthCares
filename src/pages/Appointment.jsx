import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import fetchData from "../helper/authApi";
import Loading from "../components/Loading";
import { useDispatch, useSelector } from "react-redux";
import { setLoading } from "../redux/reducers/rootSlice";
import toast from "react-hot-toast";
import "../styles/appoint.css";

// Add inline styles for status badges
const statusBadgeStyles = {
  pending: {
    backgroundColor: '#fff3e0',
    color: '#f57c00',
    border: '1px solid #ffb74d'
  },
  confirmed: {
    backgroundColor: '#f0fff4',
    color: '#2e7d32',
    border: '1px solid #4caf50'
  },
  cancelled: {
    backgroundColor: '#ffebee',
    color: '#c62828',
    border: '1px solid #ef5350'
  }
};

const Appointment = () => {
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState(null);
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.root);
  const patient = JSON.parse(localStorage.getItem("patient"));
  const userId = patient?._id;

  const retriveAllApoint = async () => {
    try {
      if (!patient || !userId) {
        setError("Please login to view appointments");
        return;
      }

      dispatch(setLoading(true));
      setError(null);

      console.log("Fetching appointments for patient:", userId);

      const response = await fetchData(
        `http://localhost:5000/api/patients/appointments`
      );

      console.log("Appointments API response:", response);

      if (response && response.data) {
        setAppointments(response.data);
        console.log("Appointments set:", response.data);
      } else {
        console.log("No appointments data in response");
        setAppointments([]);
      }
    } catch (error) {
      console.error("Error fetching appointments:", error);
      console.error("Error details:", error.response?.data);
      setError(error.response?.data?.message || error.message || "Failed to fetch appointments");
      toast.error(error.response?.data?.message || "Failed to fetch appointments");
    } finally {
      dispatch(setLoading(false));
    }
  };

  useEffect(() => {
    retriveAllApoint();
  }, []);

  return (
    <>
      <Navbar />
      <div className="page-wrapper">
        <section className="notif-section">
          <h2 className="page-heading">Your Appointments</h2>

          {loading ? (
            <Loading />
          ) : error ? (
            <div className="error-message" style={{ textAlign: 'center', padding: '2rem' }}>
              {error}
            </div>
          ) : appointments.length === 0 ? (
            <div className="no-appointments" style={{ textAlign: 'center', padding: '2rem' }}>
              <p>You don't have any appointments yet.</p>
              <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '1rem' }}>
                Visit the Doctors page to book an appointment with a doctor.
              </p>
            </div>
          ) : (
            <div className="appointments-wrapper">
              <div className="responsive-table-wrapper">
                <table className="appointments">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Doctor</th>
                      <th>Specialization</th>
                      <th>Appointment Date & Time</th>
                      <th>Booking Date</th>
                      <th>Patient Mobile</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((ele, i) => (
                      <tr key={ele?._id}>
                        <td>{i + 1}</td>
                        <td>{ele?.doctorId?.name || 'Unknown Doctor'}</td>
                        <td>{ele?.doctorId?.specialization || 'N/A'}</td>
                        <td>
                          {ele?.appointmentDate 
                            ? new Date(ele.appointmentDate).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              })
                            : 'N/A'
                          }
                        </td>
                        <td>
                          {ele?.createdAt 
                            ? new Date(ele.createdAt).toLocaleDateString("en-IN", {
                            timeZone: "Asia/Kolkata",
                              })
                            : 'N/A'
                          }
                        </td>
                        <td>{ele?.patientMobile || 'N/A'}</td>
                        <td>
                          <span 
                            className="status-badge"
                            style={{
                              padding: '4px 12px',
                              borderRadius: '20px',
                              fontSize: '0.85rem',
                              fontWeight: '500',
                              textTransform: 'capitalize',
                              ...statusBadgeStyles[ele?.status?.toLowerCase()] || {
                                backgroundColor: '#f5f5f5',
                                color: '#666',
                                border: '1px solid #ddd'
                              }
                            }}
                          >
                            {ele?.status || 'Unknown'}
                          </span>
                          </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
      <Footer />
    </>
  );
};

export default Appointment;
