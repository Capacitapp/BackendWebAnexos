// backend/models/Anexo.js
const mongoose = require("mongoose");

const AnexoSchema = new mongoose.Schema(
  {
    nombrePlantilla: {
      type: String,
      required: true,
    },
    datosRellenados: {
      type: Object,
      required: true,
    },
    fechaGeneracion: {
      type: Date,
      default: Date.now,
    },

    // 👇 NUEVO CAMPO
    usuarioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", 
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Anexo", AnexoSchema);
