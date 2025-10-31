const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || '';

let useMongo = false;
let Property;

if (MONGODB_URI) {
  const mongoose = require('mongoose');
  const propertySchema = new mongoose.Schema(
    {
      price: { type: Number, required: true },
      location: { type: String, required: true },
      rentalYield: { type: Number, required: true }
    },
    { timestamps: true }
  );
  Property = mongoose.model('Property', propertySchema);
  useMongo = true;

  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log('MongoDB connecté'))
    .catch((err) => {
      console.error('Erreur MongoDB:', err.message);
      console.error('Astuce: commente MONGODB_URI dans .env pour lancer en mode mémoire.');
      process.exit(1);
    });
} else {
  console.log('MONGODB_URI absent: mode mémoire activé (aucune base persistante).');
}

const memory = [];

// CREATE
app.post('/api/properties', async (req, res) => {
  try {
    const { price, location, rentalYield } = req.body;
    if (useMongo) {
      const doc = await new Property({ price, location, rentalYield }).save();
      return res.status(201).json(doc);
    } else {
      const obj = {
        _id: String(Date.now()),
        price: Number(price),
        location: String(location),
        rentalYield: Number(rentalYield),
        createdAt: new Date().toISOString()
      };
      memory.unshift(obj);
      return res.status(201).json(obj);
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// READ avec filtres/tri/pagination
app.get('/api/properties', async (req, res) => {
  try {
    const {
      q,
      minPrice, maxPrice,
      minYield, maxYield,
      sortBy = 'createdAt',
      order = 'desc',
      page = '1',
      pageSize = '20'
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);

    const filter = {};
    if (q) filter.location = { $regex: String(q), $options: 'i' };
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (minYield || maxYield) {
      filter.rentalYield = {};
      if (minYield) filter.rentalYield.$gte = Number(minYield);
      if (maxYield) filter.rentalYield.$lte = Number(maxYield);
    }

    const sort = { [String(sortBy)]: order === 'asc' ? 1 : -1 };

    if (useMongo) {
      const [items, total] = await Promise.all([
        Property.find(filter).sort(sort).skip((pageNum - 1) * sizeNum).limit(sizeNum),
        Property.countDocuments(filter)
      ]);
      return res.json({ items, total, page: pageNum, pageSize: sizeNum });
    } else {
      let list = [...memory];
      if (filter.location) {
        const rx = new RegExp(filter.location.$regex, 'i');
        list = list.filter(x => rx.test(x.location));
      }
      if (filter.price) {
        if (filter.price.$gte != null) list = list.filter(x => x.price >= filter.price.$gte);
        if (filter.price.$lte != null) list = list.filter(x => x.price <= filter.price.$lte);
      }
      if (filter.rentalYield) {
        if (filter.rentalYield.$gte != null) list = list.filter(x => x.rentalYield >= filter.rentalYield.$gte);
        if (filter.rentalYield.$lte != null) list = list.filter(x => x.rentalYield <= filter.rentalYield.$lte);
      }
      list.sort((a, b) => {
        if (sortBy === 'location') {
          const s = a.location.localeCompare(b.location);
          return order === 'asc' ? s : -s;
        }
        const s = (a[sortBy] ?? 0) - (b[sortBy] ?? 0);
        return order === 'asc' ? s : -s;
      });
      const total = list.length;
      const start = (pageNum - 1) * sizeNum;
      const items = list.slice(start, start + sizeNum);
      return res.json({ items, total, page: pageNum, pageSize: sizeNum });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// UPDATE
app.put('/api/properties/:id', async (req, res) => {
  try {
    const { price, location, rentalYield } = req.body;
    if (useMongo) {
      const updated = await Property.findByIdAndUpdate(
        req.params.id,
        { price, location, rentalYield },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Not found' });
      return res.json(updated);
    } else {
      const i = memory.findIndex(x => x._id === req.params.id);
      if (i === -1) return res.status(404).json({ error: 'Not found' });
      memory[i] = { ...memory[i], price, location, rentalYield };
      return res.json(memory[i]);
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// DELETE
app.delete('/api/properties/:id', async (req, res) => {
  try {
    if (useMongo) {
      const r = await Property.findByIdAndDelete(req.params.id);
      if (!r) return res.status(404).json({ error: 'Not found' });
      return res.json({ ok: true });
    } else {
      const i = memory.findIndex(x => x._id === req.params.id);
      if (i === -1) return res.status(404).json({ error: 'Not found' });
      memory.splice(i, 1);
      return res.json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => { console.log(`Serveur démarré sur 0.0.0.0:${PORT}`); });
