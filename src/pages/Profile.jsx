import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setLoading } from "../redux/reducers/rootSlice";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import fetchData from "../helper/authApi";
import Loading from "../components/Loading";
import "../styles/profile.css";
import Navbar from "../components/Navbar";
import { useAccount, useSignMessage } from 'wagmi';

function Profile() {
  const navigate = useNavigate();
  const doctor = JSON.parse(localStorage.getItem("doctor"));
  const patient = JSON.parse(localStorage.getItem("patient"));
  const user = doctor || patient;
  const userId = user?._id;
  const dispatch = useDispatch();
  const { loading } = useSelector((state) => state.root);
  const { isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [imageUrl, setImageUrl] = useState(""); // store Cloudinary image URL
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' or 'blockchain'
  const [blockchainProfile, setBlockchainProfile] = useState(null);
  const [blockchainLoading, setBlockchainLoading] = useState(false);
  const [formDetails, setFormDetails] = useState({
    name: "",
    email: "",
    phone: "",
    gender: "neither",
    address: "",
    age: "",
    password: "",
    confpassword: "",
    // Add blockchain-specific fields
    height: "",
    weight: "",
    bloodGroup: "",
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
      console.log("Fetched profile:", response.data); // check image URL here

      setFormDetails({
        ...response.data,
        password: "",
        confpassword: "",
        phone: response.data.phone || "",
        age: response.data.age ? response.data.age.toString() : "",
        gender:
          response.data.gender?.toLowerCase() === "male" ||
          response.data.gender?.toLowerCase() === "female"
            ? response.data.gender.toLowerCase()
            : "neither",
      });

      setImageUrl(response.data.image); // should be Cloudinary URL
      dispatch(setLoading(false));
    } catch (error) {
      toast.error("Failed to fetch user profile");
      dispatch(setLoading(false));
    }
  };

  const fetchBlockchainProfile = async () => {
    if (!patient) return; // Only patients have blockchain profiles
    
    setBlockchainLoading(true);
    try {
      const response = await fetchData('http://localhost:5000/api/patients/blockchain/details');
      setBlockchainProfile(response.data);
      
      // Update form details with blockchain data
      if (response.data.profile) {
        setFormDetails(prev => ({
          ...prev,
          name: response.data.profile.name || prev.name,
          age: response.data.profile.age?.toString() || prev.age,
          gender: response.data.profile.gender?.toLowerCase() || prev.gender,
          height: response.data.profile.height?.toString() || prev.height,
          weight: response.data.profile.weight?.toString() || prev.weight,
          bloodGroup: response.data.profile.bloodGroup || prev.bloodGroup,
        }));
      }
    } catch (error) {
      console.error('Error fetching blockchain profile:', error);
      toast.error('Error fetching blockchain profile');
    } finally {
      setBlockchainLoading(false);
    }
  };

  const syncProfileFromBlockchain = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet to sync blockchain profile');
      return;
    }

    setBlockchainLoading(true);
    try {
      const response = await fetchData('http://localhost:5000/api/patients/blockchain/sync', 'POST');
      toast.success('Profile synced from blockchain successfully');
      fetchBlockchainProfile(); // Refresh data
      getUser(); // Refresh main profile
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error syncing profile from blockchain');
    } finally {
      setBlockchainLoading(false);
    }
  };

  const updateBlockchainField = async (field, value) => {
    if (!isConnected) {
      toast.error('Please connect your wallet to update blockchain profile');
      return;
    }

    if (!value) {
      toast.error(`Please enter a ${field}`);
      return;
    }

    // Validation
    if (field === 'age') {
      const ageNum = parseInt(value);
      if (ageNum < 0 || ageNum > 150) {
        toast.error('Age must be between 0 and 150');
        return;
      }
    }
    
    if (field === 'height') {
      const heightNum = parseInt(value);
      if (heightNum < 50 || heightNum > 300) {
        toast.error('Height must be between 50-300 cm');
        return;
      }
    }
    
    if (field === 'weight') {
      const weightNum = parseInt(value);
      if (weightNum < 10 || weightNum > 500) {
        toast.error('Weight must be between 10-500 kg');
        return;
      }
    }

    setBlockchainLoading(true);
    try {
      await fetchData(`http://localhost:5000/api/patients/blockchain/update-${field}`, 'PUT', {
        [field]: field === 'bloodGroup' || field === 'gender' ? value : parseInt(value)
      });
      
      toast.success(`${field.charAt(0).toUpperCase() + field.slice(1)} updated on blockchain successfully`);
      fetchBlockchainProfile(); // Refresh blockchain data
    } catch (error) {
      toast.error(error.response?.data?.message || `Error updating ${field} on blockchain`);
    } finally {
      setBlockchainLoading(false);
    }
  };

  useEffect(() => {
    getUser();
    if (patient && activeTab === 'blockchain') {
      fetchBlockchainProfile();
    }
  }, [dispatch, activeTab]);

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
      const userType = localStorage.getItem("patient") ? "patient" : "doctor";
      const updateUrl =
        userType === "patient"
          ? `http://localhost:5000/api/patients/profile/${userId}`
          : `http://localhost:5000/api/doctors/profile/${userId}`;

      const payload = {
        ...formDetails,
        image: imageUrl, // use Cloudinary URL
      };

      delete payload.confpassword;

      await toast.promise(
        fetch(updateUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }),
        {
          loading: "Updating profile...",
          success: "Profile updated!",
          error: "Profile update failed.",
        }
      );
    } catch (error) {
      console.log(error);
    }
  };

  const renderBlockchainProfile = () => {
    if (!patient) {
      return (
        <div className="blockchain-not-available">
          <h3>Blockchain Profile</h3>
          <p>Blockchain profile management is only available for patients.</p>
        </div>
      );
    }

    return (
      <div className="blockchain-profile-section">
        <div className="blockchain-header">
          <h3>🔗 Blockchain Profile Management</h3>
          <p>Update your medical profile data directly on the blockchain for maximum security and transparency.</p>
          
          {!isConnected && (
            <div className="wallet-warning">
              <p>⚠️ Please connect your wallet to manage blockchain profile</p>
            </div>
          )}
        </div>

        {blockchainProfile && (
          <div className="blockchain-status">
            <div className="profile-sync-info">
              <h4>Blockchain Contract Status</h4>
              <p><strong>Contract Address:</strong> {blockchainProfile.contractAddress}</p>
              <p><strong>Last Sync:</strong> {blockchainProfile.lastSyncAt ? new Date(blockchainProfile.lastSyncAt).toLocaleString() : 'Never'}</p>
              <button 
                className="btn btn-secondary"
                onClick={syncProfileFromBlockchain}
                disabled={blockchainLoading || !isConnected}
              >
                {blockchainLoading ? '🔄 Syncing...' : '🔄 Sync from Blockchain'}
              </button>
            </div>
          </div>
        )}

        <div className="blockchain-fields">
          <h4>Update Blockchain Profile Fields</h4>
          
          <div className="blockchain-field">
            <label>Name</label>
            <div className="field-update">
              <input
                type="text"
                value={formDetails.name}
                onChange={(e) => setFormDetails({...formDetails, name: e.target.value})}
                placeholder="Enter your name"
                className="form-input"
              />
              <button 
                className="update-btn"
                onClick={() => updateBlockchainField('name', formDetails.name)}
                disabled={blockchainLoading || !isConnected}
              >
                Update on Blockchain
              </button>
            </div>
            <small>Current blockchain value: {blockchainProfile?.profile?.name || 'Not set'}</small>
          </div>

          <div className="blockchain-field">
            <label>Age</label>
            <div className="field-update">
              <input
                type="number"
                value={formDetails.age}
                onChange={(e) => setFormDetails({...formDetails, age: e.target.value})}
                placeholder="Enter your age (0-150)"
                min="0"
                max="150"
                className="form-input"
              />
              <button 
                className="update-btn"
                onClick={() => updateBlockchainField('age', formDetails.age)}
                disabled={blockchainLoading || !isConnected}
              >
                Update on Blockchain
              </button>
            </div>
            <small>Current blockchain value: {blockchainProfile?.profile?.age || 'Not set'}</small>
          </div>

          <div className="blockchain-field">
            <label>Gender</label>
            <div className="field-update">
              <select
                value={formDetails.gender}
                onChange={(e) => setFormDetails({...formDetails, gender: e.target.value})}
                className="form-input"
              >
                <option value="neither">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <button 
                className="update-btn"
                onClick={() => updateBlockchainField('gender', formDetails.gender)}
                disabled={blockchainLoading || !isConnected}
              >
                Update on Blockchain
              </button>
            </div>
            <small>Current blockchain value: {blockchainProfile?.profile?.gender || 'Not set'}</small>
          </div>

          <div className="blockchain-field">
            <label>Height (cm)</label>
            <div className="field-update">
              <input
                type="number"
                value={formDetails.height}
                onChange={(e) => setFormDetails({...formDetails, height: e.target.value})}
                placeholder="Enter height in cm (50-300)"
                min="50"
                max="300"
                className="form-input"
              />
              <button 
                className="update-btn"
                onClick={() => updateBlockchainField('height', formDetails.height)}
                disabled={blockchainLoading || !isConnected}
              >
                Update on Blockchain
              </button>
            </div>
            <small>Current blockchain value: {blockchainProfile?.profile?.height || 'Not set'} cm</small>
          </div>

          <div className="blockchain-field">
            <label>Weight (kg)</label>
            <div className="field-update">
              <input
                type="number"
                value={formDetails.weight}
                onChange={(e) => setFormDetails({...formDetails, weight: e.target.value})}
                placeholder="Enter weight in kg (10-500)"
                min="10"
                max="500"
                className="form-input"
              />
              <button 
                className="update-btn"
                onClick={() => updateBlockchainField('weight', formDetails.weight)}
                disabled={blockchainLoading || !isConnected}
              >
                Update on Blockchain
              </button>
            </div>
            <small>Current blockchain value: {blockchainProfile?.profile?.weight || 'Not set'} kg</small>
          </div>

          <div className="blockchain-field">
            <label>Blood Group</label>
            <div className="field-update">
              <select
                value={formDetails.bloodGroup}
                onChange={(e) => setFormDetails({...formDetails, bloodGroup: e.target.value})}
                className="form-input"
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
              <button 
                className="update-btn"
                onClick={() => updateBlockchainField('bloodGroup', formDetails.bloodGroup)}
                disabled={blockchainLoading || !isConnected}
              >
                Update on Blockchain
              </button>
            </div>
            <small>Current blockchain value: {blockchainProfile?.profile?.bloodGroup || 'Not set'}</small>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
     <Navbar/>
      {loading ? (
        <Loading />
      ) : (
        <section className="register-section flex-center">
          <div className="profile-container flex-center">
            <h2 className="form-heading">Profile Management</h2>

            {/* Tab Navigation */}
            <div className="tab-navigation" style={{ marginBottom: '2rem' }}>
              <button 
                className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
                style={{
                  padding: '0.5rem 1rem',
                  margin: '0 0.5rem',
                  border: activeTab === 'profile' ? '2px solid #007bff' : '1px solid #ccc',
                  backgroundColor: activeTab === 'profile' ? '#007bff' : 'white',
                  color: activeTab === 'profile' ? 'white' : 'black',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                👤 Basic Profile
              </button>
              {patient && (
                <button 
                  className={`tab-btn ${activeTab === 'blockchain' ? 'active' : ''}`}
                  onClick={() => setActiveTab('blockchain')}
                  style={{
                    padding: '0.5rem 1rem',
                    margin: '0 0.5rem',
                    border: activeTab === 'blockchain' ? '2px solid #007bff' : '1px solid #ccc',
                    backgroundColor: activeTab === 'blockchain' ? '#007bff' : 'white',
                    color: activeTab === 'blockchain' ? 'white' : 'black',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  🔗 Blockchain Profile
                </button>
              )}
            </div>

            {activeTab === 'profile' ? (
              <>
                {/* ✅ Show Cloudinary image URL directly */}
                <img
                  src={imageUrl || "/default-profile.png"}
                  alt="profile"
                  className="profile-pic"
                />

                <form onSubmit={formSubmission} className="register-form">
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

                  {/* Add height, weight, blood group for patients */}
                  {patient && (
                    <div className="form-same-row">
                      <input
                        type="number"
                        name="height"
                        className="form-input"
                        placeholder="Height (cm)"
                        value={formDetails.height}
                        onChange={inputChange}
                      />
                      <input
                        type="number"
                        name="weight"
                        className="form-input"
                        placeholder="Weight (kg)"
                        value={formDetails.weight}
                        onChange={inputChange}
                      />
                    </div>
                  )}

                  {patient && (
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
                  )}

                  <textarea
                    name="address"
                    className="form-input"
                    placeholder="Enter your address"
                    value={formDetails.address}
                    onChange={inputChange}
                    rows="2"
                  ></textarea>

                  <div className="form-same-row">
                    <input
                      type="password"
                      name="password"
                      className="form-input"
                      placeholder="Enter new password"
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

                  <button type="submit" className="btn form-btn">
                    Update Profile
                  </button>

                  <button
                    type="button"
                    className="btn form-btn"
                    onClick={() => navigate("/change-password")}
                  >
                    Change Password
                  </button>
                </form>
              </>
            ) : (
              blockchainLoading ? (
                <Loading />
              ) : (
                renderBlockchainProfile()
              )
            )}
          </div>
        </section>
      )}
    </>
  );
}

export default Profile;
