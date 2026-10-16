import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPotentialLead extends Document {
  name: string;
  shopName: string;
  number: string;
  place: string;
  createdAt: Date;
  updatedAt: Date;
}

const PotentialLeadSchema = new Schema<IPotentialLead>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    shopName: {
      type: String,
      required: [true, 'Shop name is required'],
      trim: true,
    },
    number: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    place: {
      type: String,
      required: [true, 'Place/Location is required'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent overwriting model if already compiled
const PotentialLead: Model<IPotentialLead> =
  mongoose.models.PotentialLead || mongoose.model<IPotentialLead>('PotentialLead', PotentialLeadSchema);

export default PotentialLead;
