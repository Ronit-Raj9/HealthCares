import React, { useEffect, useState } from "react";
import DoctorCard from "../components/DoctorCard";
import Footer from "../components/Footer";
import Navbar from "../components/Navbar";
import "../styles/doctors.css";

const Doctors = () => {
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDoctors = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch("http://localhost:5000/api/doctors/view");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setDoctors(data.data || []);
        } catch (e) {
            console.error("Error fetching doctors:", e);
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDoctors();
    }, []);

    return (
        <>
            <Navbar />
            <div className="doctors-container">
                <h1 className="page-heading">Doctors</h1>
                <div className="doctors-list">
                    {loading && <div>Loading doctors...</div>}
                    {error && <div className="error-message">Error: {error}</div>}
                    {!loading && !error && doctors.length === 0 && (
                        <div>No doctors found</div>
                    )}
                    {!loading && !error && doctors.length > 0 && doctors.map((ele) => (
                        <DoctorCard key={ele._id} ele={ele} />
                    ))}
                </div>
            </div>
            <Footer />
        </>
    );
};

export default Doctors;