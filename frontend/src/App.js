import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SpaceGame from "./components/SpaceGame";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SpaceGame />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;