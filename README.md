# Hangouts Frontend

A modern Angular frontend for the Hangouts social platform built with DaisyUI and TailwindCSS.

## Features

- 🎉 **Social Media Design** - Modern, responsive UI with DaisyUI components
- 🔍 **Smart Filtering** - Filter hangouts by purpose, place, and date
- 🎯 **Real-time Updates** - Live blast counts and attendee updates
- 🌙 **Theme Support** - Multiple DaisyUI themes with dark mode
- 📱 **Mobile First** - Fully responsive design
- 🔐 **Authentication** - JWT-based auth with role management

## Tech Stack

- **Angular 18** - Latest Angular with standalone components
- **TailwindCSS** - Utility-first CSS framework
- **DaisyUI** - Beautiful component library
- **TypeScript** - Type-safe development
- **RxJS** - Reactive programming

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open [http://localhost:4200](http://localhost:4200)

### Backend Setup

Make sure your NestJS backend is running on `http://localhost:3000`

## Project Structure

```
src/
├── app/
│   ├── components/          # UI Components
│   │   ├── homepage/        # Homepage with hangout grid
│   │   └── navbar/          # Navigation component
│   ├── services/            # API Services
│   │   ├── auth.service.ts  # Authentication
│   │   └── hangout.service.ts # Hangout operations
│   ├── models/              # TypeScript interfaces
│   ├── interceptors/        # HTTP interceptors
│   └── app.config.ts        # App configuration
└── styles.css               # Global styles
```

## Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm run test` - Run unit tests
- `npm run lint` - Run ESLint

## Environment Configuration

Update API URLs in services for different environments:

```typescript
// In services
private apiUrl = 'http://localhost:3000'; // Development
// private apiUrl = 'https://your-api.com'; // Production
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License