import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import fetchData from "../helper/authApi";
import Loading from "../components/Loading";
import { useDispatch, useSelector } from "react-redux";
import { setLoading } from "../redux/reducers/rootSlice";
import toast from "react-hot-toast";
import "../styles/appoint.css";

const DoctorAppointment = () => {
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState(null);
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.root);

  const doctor = JSON.parse(localStorage.getItem("doctor"));
  const doctorId = doctor?._id;

  const retrieveAllAppointments = async () => {
    try {
      if (!doctorId) {
        setError("Please login as a doctor to view appointments");
        return;
      }

      dispatch(setLoading(true));
      setError(null);

      const response = await fetchData(
        `http://localhost:5000/api/doctors/${doctorId}/appointments`
      );

      if (response?.data) {
        setAppointments(response.data);
      } else {
        setError("No appointments data received");
      }
    } catch (error) {
      console.error("Error fetching appointments:", error);
      setError(error.message || "Failed to fetch appointments");
      toast.error("Failed to fetch appointments");
    } finally {
      dispatch(setLoading(false));
    }
  };

  const updateStatus = async (appointmentId, newStatus) => {
    try {
      dispatch(setLoading(true));
      
      const response = await fetchData(
        `http://localhost:5000/api/doctors/${doctorId}/appointments/${appointmentId}`,
        "PUT",
        { status: newStatus }
      );

      if (response?.data) {
        toast.success(`Appointment ${newStatus} successfully`);
        await retrieveAllAppointments();
      } else {
        throw new Error(response?.message || "Failed to update status");
      }
    } catch (error) {
      console.error("Update failed:", error);
      toast.error(error.message || "Failed to update appointment status");
    } finally {
      dispatch(setLoading(false));
    }
  };

  useEffect(() => {
    retrieveAllAppointments();
  }, []);

  // Helper function to format status for display
  const formatStatus = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  if (error) {
    return (
      <>
        <Navbar />
        <div className="error-container" style={{ textAlign: 'center', padding: '2rem' }}>
          <h2>Error</h2>
          <p>{error}</p>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      {loading ? (
        <Loading />
      ) : (
        <div className="page-wrapper">
          <section className="notif-section">
            <h2 className="page-heading">Your Appointments</h2>

            {appointments.length === 0 ? (
              <div className="no-appointments" style={{ textAlign: 'center', padding: '2rem' }}>
                <p>You don't have any appointments yet.</p>
              </div>
            ) : (
              <div className="appointments-wrapper">
                <div className="responsive-table-wrapper">
                  <table className="appointments">
                    <thead>
                      <tr>
                        <th>S.No</th>
                        <th>Doctor</th>
                        <th>Patient</th>
                        <th>Appointment Date</th>
                        <th>Appointment Time</th>
                        <th>Booking Date</th>
                        <th>Booking Time</th>
                        <th>Status</th>
                        {doctorId === appointments[0]?.doctorId?._id && <th>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {appointments.map((ele, i) => (
                        <tr key={ele?._id}>
                          <td>{i + 1}</td>
                          <td>{ele?.doctorId?.name || "N/A"}</td>
                          <td>{ele?.patientId?.name || "N/A"}</td>
                          <td>{ele?.date}</td>
                          <td>{ele?.time}</td>
                          <td>
                            {new Date(ele?.createdAt).toLocaleDateString("en-IN", {
                              timeZone: "Asia/Kolkata",
                            })}
                          </td>
                          <td>
                            {new Date(ele?.createdAt).toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: true,
                            })}
                          </td>
                          <td>{formatStatus(ele?.status)}</td>
                          {doctorId === ele?.doctorId?._id && (
                            <td>
                              {ele.status === "pending" && (
                                <>
                                  <button
                                    className="btn user-btn accept-btn"
                                    title="Confirm"
                                    onClick={() => updateStatus(ele._id, "confirmed")}
                                  >
                                    ✅
                                  </button>
                                  <button
                                    className="btn user-btn reject-btn"
                                    title="Cancel"
                                    onClick={() => updateStatus(ele._id, "cancelled")}
                                  >
                                    ❌
                                  </button>
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      <Footer />
    </>
  );
};

export default DoctorAppointment;
