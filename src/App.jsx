import React, { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
// import './App.css'

// Lazy loaded component
import Home from './pages/Home'
import Register from './pages/Register'
import Login from './pages/Login'
import Doctors from './components/Doctors-apply'
import DoctorCard from './components/DoctorCard'
import ViewDoctor from './pages/Doctors'
import Error from './pages/Error'
import DoctorProfile from './pages/Doctors-info'
import BookingAppointment from './components/BookAppointment'
import Appointment from './pages/Appointment'
import Dashboard from './pages/Dashboard'
import ChatComponent from './pages/ChatBox'
import Profile from './pages/Profile'
import ChangePassword from './pages/Change-Password'
import ForgotPassword from './pages/ForgotPass'
import LoginDoctor from './pages/LoginDoctor'
import DoctorAppointment from './pages/DoctorAppointment'
import NotificationPatient from './pages/NotificationPatient'
import MedicalRecords from './pages/MedicalRecords'
import AccessRequests from './pages/AccessRequests'
import AuthorizedRecords from './pages/AuthorizedRecords'

function App() {
  return (
    <Router>
      <Toaster />
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/registerP"
            element={
            
                <Register />
        
            }
          
          />
          <Route
            path="/dashboard/*"
            element={
              <Dashboard />
            }
          />
          <Route path="/chat" element={<ChatComponent />} />
          <Route
            path="/loginP"
            element={
            
                <Login />
        
            }
          
          />
          
          <Route
            path="/applyfordoctor"
            element={
              <Doctors />
            }
          />
          <Route
            path="/doctors"
            element={
              <ViewDoctor/>
            }
          />
          <Route path="/doctors/:doctorId" element={<DoctorProfile />} />
          <Route path='/doctors/book-appointment' element={<BookingAppointment />} />
          <Route path='/appointmentsP' element={<Appointment />} />
          <Route path='/appointmentsD' element={<DoctorAppointment />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/reset-password/:token" element={<ChangePassword />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/loginD" element={<LoginDoctor />} />
          <Route path="/registerD" element={< Doctors/>} />
          <Route path="/notifications" element={<NotificationPatient />} />
          
          {/* Medical Records Routes */}
          <Route path="/medical-records" element={<MedicalRecords />} />
          <Route path="/access-requests" element={<AccessRequests />} />
          <Route path="/authorized-records" element={<AuthorizedRecords />} />
          
          {/* Keep error route at the bottom */}
          <Route path="*" element={<Error />} />
        </Routes>
        
      </Suspense>
    </Router>
  )
}

export default App
