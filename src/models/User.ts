import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISubscription {
  plan: 'Basic' | 'Pro' | 'Enterprise';
  status: 'active' | 'expired' | 'trial';
  expiresAt: Date;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: 'admin' | 'user';
  status: 'active' | 'suspended' | 'pending';
  shopName?: string;
  phone?: string;
  subscription: ISubscription;
  monthlyRevenue: number;
  totalTransactions: number;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    plan: {
      type: String,
      enum: ['Basic', 'Pro', 'Enterprise'],
      default: 'Basic',
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'trial'],
      default: 'trial',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 days trial
    },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending'],
      default: 'active',
    },
    shopName: {
      type: String,
      default: 'My Dukaan',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    subscription: {
      type: SubscriptionSchema,
      default: () => ({
        plan: 'Basic',
        status: 'trial',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    },
    monthlyRevenue: {
      type: Number,
      default: 0,
    },
    totalTransactions: {
      type: Number,
      default: 0,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent overwriting model if already compiled
const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
