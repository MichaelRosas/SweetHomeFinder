# 🏠 SweetHomeFinder

A full-stack web application that connects adoptable pets with their perfect homes through intelligent matching algorithms and real-time communication features.

## 📋 Overview

SweetHomeFinder is a comprehensive pet adoption platform that streamlines the adoption process for both shelters and potential adopters. The application uses a smart matching algorithm to pair pets with adopters based on preferences, personality traits, and lifestyle compatibility.

## ✨ Key Features

### For Adopters
- **Smart Pet Matching**: Take a detailed quiz to find pets that match your lifestyle and preferences
- **Match Score Algorithm**: Advanced scoring system (0-145 points) that calculates compatibility based on:
  - Animal type, breed, size, age, and gender preferences
  - Color preferences and temperament compatibility
  - Adjacent value matching (e.g., "medium" vs "large" size gets partial credit)
- **Browse & Search**: Explore available pets with detailed profiles and photos
- **Application Management**: Submit and track adoption applications in real-time
- **Real-time Chat**: Communicate directly with shelter staff about specific pets
- **User Profile**: Manage your information and saved preferences

### For Shelters
- **Pet Listings Management**: Create, edit, and manage pet profiles with detailed information
- **Application Review**: View and process incoming adoption applications
- **Applicant Matching**: See match scores for each applicant to make informed decisions
- **Direct Communication**: Message with potential adopters through the integrated chat system
- **Dashboard Analytics**: Overview of listings, applications, and adoption activity

### Technical Features
- **Role-based Access Control**: Separate interfaces and permissions for adopters and shelters
- **Protected Routes**: Secure authentication and authorization using Firebase Auth
- **Responsive Design**: Mobile-first design that works seamlessly across all devices
- **Real-time Updates**: Live data synchronization using Firebase Firestore
- **External API Integration**: Integration with PetFinder API for breed data and resources

## 🛠️ Tech Stack

### Frontend
- **React 19** - Modern UI library with hooks
- **React Router v6** - Client-side routing with protected routes
- **Vite** - Fast build tool and dev server
- **CSS3** - Custom styling with CSS variables for theming

### Backend & Services
- **Firebase Authentication** - Secure user authentication and authorization
- **Cloud Firestore** - NoSQL database for real-time data synchronization
- **Firebase Storage** - Image hosting for pet photos
- **PetFinder API** - External API integration for pet data

### Development Tools
- **ESLint** - Code quality and consistency
- **Prettier** - Code formatting
- **Husky** - Git hooks for pre-commit linting
- **lint-staged** - Run linters on staged files

## 🏗️ Project Architecture

```
src/
├── auth/              # Authentication context and route protection
├── components/        # Reusable UI components
├── firebase/          # Firebase configuration and initialization
├── pages/            # Route-based page components
├── services/         # External API integrations (PetFinder)
├── styles/           # Component-specific and global styles
└── utils/            # Helper functions (matching algorithm, chat threads)
```

### Key Components

- **Match Algorithm** (`utils/match.js`): Sophisticated scoring system with weighted preferences
- **Auth System**: Context-based authentication with role-based routing
- **Chat System** (`utils/Threads.js`): Real-time messaging between adopters and shelters
- **Pet Quiz**: Multi-step form with dynamic breed loading based on animal type

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20.x
- npm >= 10.x
- Firebase account with project setup

### Installation

1. Clone the repository
```bash
git clone https://github.com/MichaelRosas/SweetHomeFinder.git
cd SweetHomeFinder
```

2. Install dependencies
```bash
npm install
```

3. Set up Firebase configuration
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication (Email/Password)
   - Create a Firestore database
   - Add your Firebase config to `src/firebase/config.js`

4. Configure PetFinder API (optional)
   - Sign up for a [PetFinder API key](https://www.petfinder.com/developers/)
   - Add credentials to your environment

5. Start the development server
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## 📝 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build locally
npm run lint         # Check code quality
npm run lint:fix     # Fix linting issues
npm run format       # Format code with Prettier
```

## 🔐 Firebase Setup

### Firestore Collections

The application uses the following Firestore structure:

- `users/` - User profiles with role (adopter/shelter)
- `pets/` - Pet listings with details and photos
- `applications/` - Adoption applications
- `threads/` - Chat conversations
- `messages/` - Individual chat messages

### Security Rules

Configure Firestore security rules in `firestore.rules` to ensure:
- Users can only read their own profile
- Shelters can create/edit their own pet listings
- Applications are visible to both parties
- Chat messages are only accessible to participants

---

Built with ❤️ to help pets find their forever homes
