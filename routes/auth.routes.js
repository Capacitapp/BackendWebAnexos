const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware"); 

// Rutas públicas (Cualquiera puede entrar)
router.post("/register", authController.register);
router.post("/login", authController.login);

// 👇 AQUÍ ESTÁ LA NUEVA RUTA (Pública) 👇
// Esta es la que usa la pantalla de "Recuperar Contraseña" sin estar logueado
router.put("/reset-password-public", authController.resetPasswordPublic);

// Ruta protegida (Solo usuarios logueados con Token)
router.put("/change-password", authMiddleware, authController.changePassword);

module.exports = router;