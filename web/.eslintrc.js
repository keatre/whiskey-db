module.exports = {
  root: true,
  extends: ["next", "next/core-web-vitals", "plugin:jsx-a11y/recommended"],
  plugins: ["jsx-a11y"],
  env: {
    browser: true,
    node: true,
  },
  rules: {
    "react/react-in-jsx-scope": "off",
  },
};
