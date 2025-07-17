import axios from 'axios';

const fetchData = async (url, method = "GET", body = null, options = {}) => {
  // Get token from either patient or doctor storage
  let token = localStorage.getItem("token");
  
  // If no direct token, check patient and doctor storage
  if (!token) {
    const patientData = localStorage.getItem("patient");
    const doctorData = localStorage.getItem("doctor");
    
    if (patientData) {
      const patient = JSON.parse(patientData);
      token = patient.token || patient.accessToken;
    } else if (doctorData) {
      const doctor = JSON.parse(doctorData);
      token = doctor.token || doctor.accessToken;
    }
  }

  const config = {
    method: method,
    url: url,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(body && { data: body }), // Only include 'data' if body is provided
    ...options, // Include any additional options like responseType
  };

  const { data } = await axios(config);
  return data;
};

export default fetchData;
