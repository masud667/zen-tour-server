const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASS}@cluster0.cdz9cop.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const jsonString = Buffer.from(base64, "base64").toString("utf8");
const serviceAccount = JSON.parse(jsonString);


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(403).send({ message: "Forbidden" });
  }
};

async function run() {
  try {
    // await client.connect();
    // console.log("MongoDB connected");

    const db = client.db("zentour");
    const packagesCollection = db.collection("tourPackages");
    const bookingsCollection = db.collection("tourBookings");
    const subscriptionsCollection = db.collection("subscriptions");




// POST route to store subscription
app.post("/subscribe", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const existing = await subscriptionsCollection.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Already subscribed" });
    }

    const result = await subscriptionsCollection.insertOne({ email, date: new Date() });
    res.status(201).json({ message: "Subscribed successfully", data: result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


    app.post("/bookings", async (req, res) => {
      try {
        const booking = req.body;
        const result = await bookingsCollection.insertOne(booking);
        if (!booking.packageId) {
          throw new Error("Missing packageId in booking.");
        }
        // Check if packageId looks like ObjectId (24 hex char)
        const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(booking.packageId);

        let updateFilter;
        if (isValidObjectId) {
          updateFilter = { _id: new ObjectId(booking.packageId) };
        } else {
          updateFilter = { id: booking.packageId };
        }
        const updateResult = await packagesCollection.updateOne(updateFilter, {
          $inc: { booking_count: 1 },
        });
        res.send({ success: true, result, updateResult });
      } catch (error) {
        console.error("❌ Booking creation failed:", error.message);
        res.status(500).send({ success: false, message: error.message });
      }
    });

    // Get new package
    app.get("/packages", async (req, res) => {
      try {
        const packages = await packagesCollection.find().toArray();
        res.send(packages);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch packages" });
      }
    });

    //update
    app.put("/packages/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid package ID" });
        }
        const updatedPackage = req.body;
        delete updatedPackage._id;
        const result = await packagesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedPackage }
        );
        if (result.modifiedCount > 0) {
          res.send({ message: "Package updated successfully" });
        } else {
          res
            .status(404)
            .send({ message: "Package not found or not modified" });
        }
      } catch (error) {
        console.error("Update error:", error);
        res.status(500).send({ message: "Failed to update package" });
      }
    });

    // delete
    app.delete("/packages/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid package ID" });
        }
        const result = await packagesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount > 0) {
          res.send({ message: "Package deleted successfully" });
        } else {
          res.status(404).send({ message: "Package not found" });
        }
      } catch (error) {
        console.error("Delete error:", error);
        res.status(500).send({ message: "Failed to delete package" });
      }
    });

    // GET bookings
    app.get("/bookings", verifyFirebaseToken, async (req, res) => {
      try {
        const email = req.user?.email;

        if (!email) {
          return res.status(401).send({ message: "Unauthorized" });
        }

        const userBookings = await bookingsCollection
          .find({ buyerEmail: email })
          .toArray();

        res.send(userBookings);
      } catch (error) {
        console.error("Error fetching bookings:", error);
        res.status(500).send({ message: "Failed to fetch bookings" });
      }
    });

    // status update
    app.patch("/bookings/:id", verifyFirebaseToken, async (req, res) => {
      const email = req.user?.email;
      if (!email) return res.status(401).send({ message: "Unauthorized" });

      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid booking ID" });
      }

      const result = await bookingsCollection.updateOne(
        { _id: new ObjectId(id), buyerEmail: email }, // only allow own booking
        { $set: { status: "completed" } }
      );

      if (result.modifiedCount > 0) {
        res.send({ message: "Booking status updated successfully" });
      } else {
        res
          .status(404)
          .send({ message: "Booking not found or already completed" });
      }
    });

    // POST new package
    app.post("/packages", async (req, res) => {
      try {
        const packageData = req.body;
        const result = await packagesCollection.insertOne(packageData);
        res.send(result);
      } catch (error) {
        console.error("Failed to create package", error);
        res.status(500).send({ error: "Failed to create package" });
      }
    });

    app.get("/", verifyFirebaseToken, (req, res) => {
      res.send("Zentour server is running");
    });

    app.listen(port, () => {
      console.log(`Zentour server running on port ${port}`);
    });
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

run().catch(console.dir);
