const express = require("express");
const router = express.Router();
const anexoController = require("../controllers/anexo.controller");
const auth = require("../middleware/auth.middleware");

// 🔐 Subir plantilla (protegido)
router.post(
  "/subir",
  auth,
  anexoController.upload.single("file"),
  anexoController.subirPlantilla
);

// 🔐 Generar documento manual
router.post(
  "/generar",
  auth,
  anexoController.generarAnexo
);

// 🔐 Generación inteligente con IA
router.post(
  "/inteligente",
  auth,
  anexoController.uploadTecnico,
  anexoController.generarAnexoInteligente
);

// 🔐 CRUD Básico de Anexos
router.get("/", auth, anexoController.obtenerAnexos);
router.get("/:id", auth, anexoController.obtenerAnexoPorId);
router.patch("/:id", auth, anexoController.actualizarAnexo);
router.delete("/:id", auth, anexoController.eliminarAnexo);

module.exports = router;
