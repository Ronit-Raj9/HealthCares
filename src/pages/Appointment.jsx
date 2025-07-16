import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import fetchData from "../helper/authApi";
import Loading from "../components/Loading";
import { useDispatch, useSelector } from "react-redux";
import { setLoading } from "../redux/reducers/rootSlice";
import toast from "react-hot-toast";
import "../styles/appoint.css";

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

      const response = await fetchData(
        `http://localhost:5000/api/patients/${userId}/appointments`
      );

      if (response && response.data) {
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
                      {userId === appointments[0]?.doctorId?._id && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((ele, i) => (
                      <tr key={ele?._id}>
                        <td>{i + 1}</td>
                        <td>{ele?.doctorId?.name}</td>
                        <td>{ele?.patientId?.name}</td>
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
                        <td>{ele?.status}</td>
                        {userId === ele?.doctorId?._id && (
                          <td>
                            <button
                              className={`btn user-btn accept-btn ${
                                ele?.status === "Completed" ? "disable-btn" : ""
                              }`}
                              disabled={ele?.status === "Completed"}
                            >
                              Complete
                            </button>
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
      <Footer />
    </>
  );
};

export default Appointment;
