import React,{useState} from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import "../styles/login.css"
import axios from 'axios';
import toast from "react-hot-toast"
import LoginImage from '../images/login.jpg';
import {useDispatch} from 'react-redux';
import {setUserInfo} from '../redux/reducers/rootSlice';
// import { useNavigate } from 'react-router-dom';

// axios.defaults.baseURL = "";

function LoginDoctor(){
    const [file,setFile]=useState("");
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const dispatch = useDispatch();
    const [formDetails, setFormDetails] = useState({
   
    email: "",
    password: "",
    
  });
  const inputChange = (e) => {
    const { name, value } = e.target;
    return setFormDetails({
      ...formDetails,
      [name]: value,
    });
  };
  const formSubmit = async (e) => {
    try {
      e.preventDefault();

      if (loading) return;
    

      const {  email, password } =
        formDetails;
      if ( !email || !password ) {
        return toast.error("Input field should not be empty");
      } else if (password.length < 5) {
        return toast.error("Password must be at least 5 characters long");
      } 
      await toast.promise(
        axios.post("http://localhost:5000/api/doctors/login",{
          email,
          password,
        },{withCredentials: true}),
        {
          loading: "Logging in...",
          success: (response) => {
            console.log(response);
            setLoading(false);
            dispatch(setUserInfo(response.data.data.doctorData));
            localStorage.setItem("token", response.data.data.accessToken);
            console.log(response);
            localStorage.setItem("doctor", JSON.stringify(response.data.data.doctorData));
            console.log("Login successful:", response.data.data.doctorData);
            return "Login successful";
          },
          error: (error) => {
  setLoading(false);
  const msg = error?.response?.data?.message;
  console.log("Error message:", error);

  if (msg === "Invalid credentials") {
    return "Invalid email or password";
  } else if (msg === "User not found") {
    return "User not found";
  } else {
    return "Login failed";
  }
}

        }
      )
      navigate("/");
   }catch(e){
    console.log(e)
   }
 }
 return(
    <section className="register-section flex-center">
         <div className="register-wrapper">
            <div className="register-image">
      <img src={LoginImage} alt="Register Visual" />
    </div>
      <div className="register-container flex-center">
        <h2 className="form-heading">Sign In</h2>
        <form
          onSubmit={formSubmit}
          className="register-form"
        >
          
         {/* <input
            type="text"
            name="name"
            className="form-input"
            placeholder="Enter your name"
            value={formDetails.name}
            onChange={inputChange}
          /> */}
          <input
            type="email"
            name="email"
            className="form-input"
            placeholder="Enter your email"
            value={formDetails.email}
            onChange={inputChange}
          />
          {/* <input
            type="file"
            onChange={(e) => onUpload(e.target.files[0])}
            name="profile-pic"
            id="profile-pic"
            className="form-input"
          /> */}
          <input
            type="password"
            name="password"
            className="form-input"
            placeholder="Enter your password"
            value={formDetails.password}
            onChange={inputChange}
          />
          
          <button
            type="submit"
            className="btn form-btn"
            disabled={loading ? true : false}
          >
            sign In
          </button>
        </form>
        <p>
          Forgot Password?{" "}
          <NavLink
            className="login-link"
            to={"/forgot-password"}
          >
            Forgot
          </NavLink>
        </p>
      </div>
      </div>
    </section>
 )
}
export default LoginDoctor;