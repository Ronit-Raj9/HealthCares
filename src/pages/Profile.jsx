import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setLoading } from "../redux/reducers/rootSlice";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import fetchData from "../helper/authApi";
import Loading from "../components/Loading";
import "../styles/profile.css";
import Navbar from "../components/Navbar";
import { useAccount } from 'wagmi';

function Profile() {
  const navigate = useNavigate();
  const doctor = JSON.parse(localStorage.getItem("doctor"));
  const patient = JSON.parse(localStorage.getItem("patient"));
  const user = doctor || patient;
  const userId = user?._id;
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.root);
  const { isConnected } = useAccount();

  const [imageUrl, setImageUrl] = useState("");
  const [contractStatus, setContractStatus] = useState(null);
  const [formDetails, setFormDetails] = useState({
    name: "",
    email: "",
    phone: "",
    gender: "neither",
    address: "",
    age: "",
    height: "",
    weight: "",
    bloodGroup: "",
    password: "",
    confpassword: "",
  });

  const getUser = async () => {
    try {
      dispatch(setLoading(true));
      const userType = localStorage.getItem("patient") ? "patient" : "doctor";
      const user = JSON.parse(localStorage.getItem(userType));
      const userId = user?._id;
      if (!userId) return;

      const profileUrl =
        userType === "patient"
          ? `http://localhost:5000/api/patients/profile/${userId}`
          : `http://localhost:5000/api/doctors/profile/${userId}`;

      const response = await fetchData(profileUrl);
      console.log("Fetched profile:", response.data);

      setFormDetails({
        ...response.data,
        password: "",
        confpassword: "",
        phone: response.data.phone || "",
        age: response.data.age ? response.data.age.toString() : "",
        height: response.data.height ? response.data.height.toString() : "",
        weight: response.data.weight ? response.data.weight.toString() : "",
        bloodGroup: response.data.bloodGroup || "",
        gender:
          response.data.gender?.toLowerCase() === "male" ||
          response.data.gender?.toLowerCase() === "female"
            ? response.data.gender.toLowerCase()
            : "neither",
      });

      setImageUrl(response.data.image);
      dispatch(setLoading(false));
    } catch (error) {
      toast.error("Failed to fetch user profile");
      dispatch(setLoading(false));
    }
  };

  const getContractStatus = async () => {
    if (!patient) return; // Only for patients
    
    try {
      const response = await fetchData('http://localhost:5000/api/patients/contract/status');
      setContractStatus(response.data);
    } catch (error) {
      console.error('Error fetching contract status:', error);
    }
  };

  useEffect(() => {
    getUser();
    getContractStatus();
  }, [dispatch]);

  const inputChange = (e) => {
    const { name, value } = e.target;
    setFormDetails({
      ...formDetails,
      [name]: value,
    });
  };

  const formSubmission = async (e) => {
    e.preventDefault();

    if (formDetails.password && formDetails.password !== formDetails.confpassword) {
      return toast.error("Passwords do not match");
    }

    try {
      dispatch(setLoading(true));

      const userType = localStorage.getItem("patient") ? "patient" : "doctor";
      
      if (userType === "patient") {
        // Use unified profile update for patients
        const payload = {
          ...formDetails,
          image: imageUrl,
        };
        delete payload.confpassword;

        const response = await fetchData(
          `http://localhost:5000/api/patients/profile/update`,
          'PUT',
          payload
        );

        // Show appropriate success message based on what was updated
        if (response.data.blockchainUpdated) {
          toast.success("✅ Profile updated successfully (Database + Blockchain)");
          if (response.data.blockchainTransaction) {
            console.log('Blockchain transaction:', response.data.blockchainTransaction.transactionHash);
          }
        } else if (response.data.blockchainError) {
          toast("⚠️ Profile updated in database, but blockchain update failed", {
            icon: '⚠️',
            style: {
              borderLeft: '4px solid #f59e0b',
              backgroundColor: '#fef3c7'
            }
          });
          console.error('Blockchain error:', response.data.blockchainError);
        } else {
          toast.success("✅ Profile updated successfully");
        }

        // Refresh contract status
        getContractStatus();
      } else {
        // Use traditional update for doctors
        const updateUrl = `http://localhost:5000/api/doctors/profile/${userId}`;
        const payload = {
          ...formDetails,
          image: imageUrl,
        };
        delete payload.confpassword;

        await fetch(updateUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        toast.success("Profile updated successfully!");
      }

    } catch (error) {
      console.error("Profile update error:", error);
      toast.error(error.response?.data?.message || "Profile update failed");
    } finally {
      dispatch(setLoading(false));
    }
  };

  return (
    <>
      <Navbar />
      {loading ? (
        <Loading />
      ) : (
        <section className="register-section flex-center">
          <div className="profile-container flex-center">
            <h2 className="form-heading">Profile Management</h2>

            {/* Contract Status for Patients */}
            {patient && contractStatus && (
              <div className="contract-status-info" style={{
                background: contractStatus.hasContract ? '#d4edda' : '#f8d7da',
                color: contractStatus.hasContract ? '#155724' : '#721c24',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '20px',
                border: `1px solid ${contractStatus.hasContract ? '#c3e6cb' : '#f5c6cb'}`,
                textAlign: 'center'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                  🔗 Blockchain Status
                </div>
                <div style={{ fontSize: '14px' }}>
                  {contractStatus.hasContract ? (
                    <>
                      ✅ Contract Deployed - Profile updates will sync to blockchain
                      {!isConnected && (
                        <div style={{ marginTop: '5px', color: '#856404' }}>
                          ⚠️ Connect wallet for blockchain verification
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      ❌ Contract not deployed - Profile updates will be database only
                      <div style={{ fontSize: '12px', marginTop: '5px' }}>
                        Status: {contractStatus.contractDeploymentStatus}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Profile Image */}
            <img
              src={imageUrl || "/default-profile.png"}
              alt="profile"
              className="profile-pic"
            />

            <form onSubmit={formSubmission} className="register-form">
              {/* Basic Information */}
              <div className="form-same-row">
                <input
                  type="text"
                  name="name"
                  className="form-input"
                  placeholder="Enter your name"
                  value={formDetails.name}
                  onChange={inputChange}
                />
              </div>

              <div className="form-same-row">
                <input
                  type="email"
                  name="email"
                  className="form-input"
                  placeholder="Enter your email"
                  value={formDetails.email}
                  onChange={inputChange}
                />
                <select
                  name="gender"
                  value={formDetails.gender}
                  className="form-input"
                  onChange={inputChange}
                >
                  <option value="neither">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <div className="form-same-row">
                <input
                  type="text"
                  name="age"
                  className="form-input"
                  placeholder="Enter your age"
                  value={formDetails.age}
                  onChange={inputChange}
                />
                <input
                  type="text"
                  name="phone"
                  className="form-input"
                  placeholder="Enter your mobile number"
                  value={formDetails.phone}
                  onChange={inputChange}
                />
              </div>

              {/* Medical Information (For Patients Only) */}
              {patient && (
                <>
                  <div className="form-same-row">
                    <input
                      type="number"
                      name="height"
                      className="form-input"
                      placeholder="Height (cm)"
                      min="50"
                      max="300"
                      value={formDetails.height}
                      onChange={inputChange}
                    />
                    <input
                      type="number"
                      name="weight"
                      className="form-input"
                      placeholder="Weight (kg)"
                      min="10"
                      max="500"
                      value={formDetails.weight}
                      onChange={inputChange}
                    />
                  </div>

                  <div className="form-same-row">
                    <select
                      name="bloodGroup"
                      value={formDetails.bloodGroup}
                      className="form-input"
                      onChange={inputChange}
                    >
                      <option value="">Select Blood Group</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </div>
                </>
              )}

              <textarea
                name="address"
                className="form-input"
                placeholder="Enter your address"
                value={formDetails.address}
                onChange={inputChange}
                rows="2"
              ></textarea>

              {/* Password Section */}
              <div className="form-same-row">
                <input
                  type="password"
                  name="password"
                  className="form-input"
                  placeholder="Enter new password (optional)"
                  value={formDetails.password}
                  onChange={inputChange}
                />
                <input
                  type="password"
                  name="confpassword"
                  className="form-input"
                  placeholder="Confirm new password"
                  value={formDetails.confpassword}
                  onChange={inputChange}
                />
              </div>

              <button type="submit" className="btn form-btn" disabled={loading}>
                {loading ? "Updating..." : "Update Profile"}
              </button>

              <button
                type="button"
                className="btn form-btn"
                onClick={() => navigate("/change-password")}
              >
                Change Password
              </button>
            </form>

            {/* Blockchain Info for Patients */}
            {patient && contractStatus && contractStatus.hasContract && (
              <div className="blockchain-info" style={{
                marginTop: '20px',
                padding: '15px',
                background: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6',
                fontSize: '12px',
                color: '#6c757d'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>📊 Blockchain Contract Info</div>
                <div><strong>Contract:</strong> {contractStatus.contractAddress?.slice(0, 10)}...{contractStatus.contractAddress?.slice(-8)}</div>
                {contractStatus.lastBlockchainProfileUpdate && (
                  <div><strong>Last Sync:</strong> {new Date(contractStatus.lastBlockchainProfileUpdate).toLocaleDateString()}</div>
                )}
                <div><strong>Status:</strong> {contractStatus.blockchainProfileSynced ? '✅ Synced' : '⚠️ Out of sync'}</div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

export default Profile;
