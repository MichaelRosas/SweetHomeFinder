import React from 'react';
import { Link } from 'react-router-dom';
import NavBar from '../components/NavBar';
import '../styles/Welcome.css';

function Welcome() {
  return (
    <div className="welcome-container">
      <NavBar variant="public" />

      <main className="welcome-main">
        <div className="content-section">
          <div className="content-left">
            <h1>Find Your Perfect Companion</h1>
            <p>
              We connect loving pets with caring families. Discover thousands of adorable animals
              waiting for their forever homes.
            </p>
            <Link to="/signup" className="cta-button">
              Get Started
            </Link>
          </div>
          <div className="content-right">
            <img
              src="/pets-welcome.png"
              alt="Happy pets waiting for adoption"
              className="hero-image"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default Welcome;
