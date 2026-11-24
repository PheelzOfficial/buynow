export const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_d, r) => {
      delete r._id;
      delete r.__v;
      return r;
    },
  },
};
