FROM node:18-slim

# Install LaTeX (required for pdflatex)
RUN apt-get update && apt-get install -y \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependencies first (better caching)
COPY package*.json ./
RUN npm install --production

# Copy remaining files
COPY . .

# Render uses port 10000 by default
EXPOSE 10000

# Start the app
CMD ["npm", "start"]