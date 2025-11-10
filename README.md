start 3 terminals, then 

In terminal one run :  ipfs daemon

In terminal two run: npm run dev

In terminal three run : cd backend , npm run dev











# 🚀 React + Vite Boilerplate

This is a minimal and fast setup for building modern React applications using **[Vite](https://vitejs.dev/)**. It includes support for **Hot Module Replacement (HMR)**, **ESLint**, and optional **SWC or Babel** configurations for development.

## 📦 Features

- ⚡️ Lightning-fast development with Vite
- ♻️ HMR (Hot Module Replacement)
- ✅ ESLint configured for React best practices
- 🛠 Choose between **Babel** or **SWC** plugin
- 💡 Easily extendable to TypeScript, Tailwind, Prettier, etc.

## 🧱 Project Structure

```

my-app/
├── public/             # Static assets
├── src/
│   ├── assets/         # Images and icons
│   ├── components/     # Reusable components
│   ├── App.jsx         # Main App component
│   ├── main.jsx        # Entry point
├── .eslintrc.cjs       # ESLint configuration
├── vite.config.js      # Vite configuration
└── package.json

````

## 🛠️ Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/react-vite-starter.git
cd react-vite-starter
````

### 2. Install dependencies

```bash
npm install
# or
yarn install
```

### 3. Start the development server

```bash
npm run dev
```

Your app will be available at [http://localhost:5173](http://localhost:5173)

### 4. Build for production

```bash
npm run build
```

### 5. Preview the production build

```bash
npm run preview
```

## 🔍 ESLint

ESLint is pre-configured for React using:

* `eslint:recommended`
* `plugin:react/recommended`
* `plugin:react-hooks/recommended`

To run lint:

```bash
npm run lint
```

## 🧪 Recommended Add-ons

If you're planning to build a production-grade app, consider adding:

* 🔹 **TypeScript** – for static typing
* 🎨 **Tailwind CSS** – for utility-first styling
* 🧹 **Prettier** – for consistent code formatting
* 🧪 **Jest / Vitest** – for unit testing
* ⚙️ **React Router** – for routing
* 🔐 **dotenv** – for environment variables

## 📚 Resources

* [Vite Documentation](https://vitejs.dev)
* [React Documentation](https://reactjs.org)
* [ESLint Documentation](https://eslint.org)
* [SWC](https://swc.rs)
* [Babel](https://babeljs.io)

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

Happy coding! ✨

```

---

Let me know if you'd like this README to include badges (build, license, GitHub stars), GitHub Actions CI setup, Tailwind integration, or deployment steps (like Vercel/Netlify).
```
