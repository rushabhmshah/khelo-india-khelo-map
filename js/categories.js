// Khelo India Khelo business taxonomy — members PICK from this list, they never type a category.
// Edit here, then run `python3 tools/gen_category_sql.py` to refresh the database seed
// (the database rejects any category/sub-category pair that is not in this list).
window.KIK_CATEGORIES = {
  "Manufacturing & Industrial": ["Engineering & Machinery", "Plastics & Packaging", "Metals & Castings", "Electrical & Electronics", "Ceramics & Glass", "Paper & Printing", "Other Manufacturing"],
  "Textiles, Apparel & Jewellery": ["Textile Manufacturing", "Garments & Fashion", "Diamonds", "Gold & Jewellery", "Handicrafts", "Other Textiles & Apparel"],
  "Chemicals, Pharma & Healthcare": ["Chemicals & Dyes", "Pharmaceuticals", "Hospital & Clinic", "Doctor / Specialist", "Diagnostics & Labs", "Medical Devices", "Wellness & Fitness"],
  "Trading, Import & Export": ["Import", "Export", "Wholesale & Distribution", "Commodities", "Other Trading"],
  "Retail & Consumer": ["Retail Store", "E-commerce / D2C", "FMCG", "Consumer Durables", "Franchise"],
  "Real Estate & Construction": ["Developer / Builder", "Contractor", "Architecture & Interiors", "Building Materials", "Property Broker"],
  "Finance, Tax & Legal": ["Chartered Accountant", "Company Secretary", "Lawyer / Advocate", "Banking & NBFC", "Insurance", "Wealth & Investments", "Stock Broking"],
  "Technology & IT": ["Software & SaaS", "IT Services", "AI & Data", "Hardware & Telecom", "Digital Agency", "Cybersecurity"],
  "Consulting & Professional Services": ["Management Consulting", "HR & Recruitment", "Advisory & M&A", "Engineering Consulting", "Other Professional Services"],
  "Media, Marketing & Events": ["Advertising & Marketing", "Media & Publishing", "Film & Entertainment", "Events & Weddings", "Design & Creative"],
  "Hospitality, Food & Travel": ["Hotels & Resorts", "Restaurants & Catering", "Travel & Tourism", "Food Processing"],
  "Logistics & Transport": ["Freight & Shipping", "Customs Clearing", "Warehousing", "Transport & Fleet", "Courier"],
  "Agriculture & Agri-business": ["Farming & Plantations", "Agri Inputs", "Dairy & Poultry", "Agri Trading"],
  "Energy & Infrastructure": ["Solar & Renewables", "Oil & Gas", "Power & Utilities", "Infrastructure Projects"],
  "Automobile": ["Dealership", "Auto Components", "EV", "Service & Spares"],
  "Education & Training": ["School / College", "Coaching & EdTech", "Skill Training"],
  "Social Sector & Public Life": ["NGO / Trust", "Government / PSU", "Politics & Public Service"],
  "Student / Professional": ["Student", "Salaried Professional", "Retired"]
};
