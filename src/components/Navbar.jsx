import { NavLink, useNavigate } from "react-router-dom";
import { HashLink } from "react-router-hash-link";
import "../styles/navbar.css";
import { FiMenu } from "react-icons/fi";
import { RxCross1 } from "react-icons/rx";
import { useState, useEffect } from "react";
import { ConnectButton } from '@rainbow-me/rainbowkit';

const Navbar = () => {
  const navigate = useNavigate();
  const [iconActive, setIconActive] = useState(false);
  const [tokenType, setTokenType] = useState(null); // "patient" or "doctor"
  const [user, setUser] = useState(null);

  useEffect(() => {
    const patient = localStorage.getItem("patient");
    const doctor = localStorage.getItem("doctor");

    if (patient) {
      setTokenType("patient");
      setUser(JSON.parse(patient));
    } else if (doctor) {
      setTokenType("doctor");
      setUser(JSON.parse(doctor));
    }
  }, []);

  const logoutFunc = () => {
    localStorage.removeItem("patient");
    localStorage.removeItem("doctor");
    setTokenType(null);
    setUser(null);
    navigate("/login");
  };

  return (
    <header>
      <nav className={iconActive ? "nav-active" : ""}>
        <h2 className="nav-logo">
          <NavLink to={"/"}>HealthBooker</NavLink>
        </h2>
        <ul className="nav-links">
          <li><NavLink to={"/"}>Home</NavLink></li>
          <li><NavLink to={"/doctors"}>Doctors</NavLink></li>

          {tokenType && user?.isAdmin && (
            <li><NavLink to={"/dashboard/users"}>Dashboard</NavLink></li>
          )}

          {tokenType && !user?.isAdmin && (
            <>
              <li>
                <NavLink to={tokenType === "patient" ? "/appointmentsP" : "/appointmentsD"}>
                  Appointments
                </NavLink>
              </li>
              <li>
                <NavLink to={tokenType === "patient" ? "/notifications" : "/notifications"}>
                  Notifications
                </NavLink>
              </li>
              <li><HashLink to={"/#contact"}>Contact Us</HashLink></li>
              <li><NavLink to={"/profile"}>Profile</NavLink></li>
            </>
          )}

          {!tokenType && (
            <>
              <li><NavLink className="btn" to={"/loginP"}>Patient Login</NavLink></li>
              <li><NavLink className="btn" to={"/registerP"}>Patient Register</NavLink></li>
              <li><NavLink className="btn" to={"/loginD"}>Doctor Login</NavLink></li>
              <li><NavLink className="btn" to={"/registerD"}>Doctor Register</NavLink></li>
            </>
          )}

          <li style={{ display: 'flex', alignItems: 'center' }}>
            <ConnectButton />
          </li>

          {tokenType && (
            <li>
              <span className="btn" onClick={logoutFunc}>Logout</span>
            </li>
          )}
        </ul>
      </nav>

      <div className="menu-icons">
        {!iconActive ? (
          <FiMenu className="menu-open" onClick={() => setIconActive(true)} />
        ) : (
          <RxCross1 className="menu-close" onClick={() => setIconActive(false)} />
        )}
      </div>
    </header>
  );
};

export default Navbar;
