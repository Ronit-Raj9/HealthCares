import React, { useState } from "react";
import "../styles/bookappointment.css";
import axios from "axios";
import toast from "react-hot-toast";
import { IoMdClose } from "react-icons/io";

const BookingAppointment = ({ ele, onClose }) => {
  const [formData, setFormData] = useState({
    date: "",
    time: "",
    patientMobile: "",
  });

  const inputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const book = async (e) => {
    e.preventDefault();

    const appointmentDate = new Date(`${formData.date}T${formData.time}`);
    
    // Validate that appointment date is not in the past
    const now = new Date();
    if (appointmentDate <= now) {
      toast.error("Appointment date and time must be in the future.");
      return;
    }

    // Log the appointment date for debugging
    console.log("Appointment date being sent:", appointmentDate);
    console.log("Formatted date:", appointmentDate.toISOString());

    // TODO: Replace with actual logged-in patient ID
    const patient = localStorage.getItem("patient"); // Set during login
    const patientId= patient ? JSON.parse(patient)._id : null;
    if (!patientId) {
      toast.error("Patient not logged in.");
      return;
    }

    try {
      await toast.promise(
        axios.post(`http://localhost:5000/api/patients/${patientId}/appointments`, {
          doctorId: ele._id,
          appointmentDate,
          patientMobile: formData.patientMobile,
        },{
          withCredentials: true,
        }),
        {
          loading: "Booking appointment...",
          success: "Appointment booked successfully!",
          error: "Error booking appointment",
        }
      );
      onClose();
    } catch (error) {
      console.log(error);
      // toast.error("Error booking appointment");
    }
  };

  return (
    <div className="modal flex-center">
      <div className="modal__content">
        <h2 className="page-heading">Book Appointment</h2>
        <IoMdClose onClick={onClose} className="close-btn" />
        <div className="register-container flex-center book">
          <form className="register-form" onSubmit={book}>
            <input
              type="date"
              name="date"
              className="form-input"
              value={formData.date}
              onChange={inputChange}
              min={new Date().toISOString().split('T')[0]}
              required
            />
            <input
              type="time"
              name="time"
              className="form-input"
              value={formData.time}
              onChange={inputChange}
              required
            />
            <input
              type="tel"
              name="patientMobile"
              className="form-input"
              placeholder="Patient Mobile"
              value={formData.patientMobile}
              onChange={inputChange}
              required
            />
            <button type="submit" className="btn form-btn">
              Book
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BookingAppointment;
