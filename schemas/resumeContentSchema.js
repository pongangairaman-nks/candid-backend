/**
 * Resume Content JSON Schema
 * 
 * Defines the hierarchical structure for resume content.
 * This schema separates content from LaTeX formatting.
 * 
 * Structure:
 * - metadata: Basic info (name, email, phone, location, links)
 * - sections: Organized by section type (summary, skills, experience, projects, education, certifications)
 * - Each section can be text or list type
 * - Experience items have bullets with individual IDs for targeted optimization
 */

const resumeContentSchema = {
  metadata: {
    name: String,
    email: String,
    phone: String,
    location: String,
    links: [
      {
        label: String,
        url: String
      }
    ]
  },
  sections: {
    summary: {
      type: 'text',
      title: 'Professional Summary',
      content: String
    },
    skills: {
      type: 'list',
      title: 'Core Skills',
      items: [
        {
          id: String, // e.g., "skill_1", "skill_2"
          category: String, // e.g., "Backend", "Frontend", "DevOps"
          content: String
        }
      ]
    },
    experience: {
      type: 'list',
      title: 'Professional Experience',
      items: [
        {
          id: String, // e.g., "exp_1", "exp_2"
          company: String,
          position: String,
          duration: String, // e.g., "Jan 2020 - Dec 2021"
          location: String,
          bullets: [
            {
              id: String, // e.g., "exp_1_bullet_1", "exp_1_bullet_2"
              content: String
            }
          ]
        }
      ]
    },
    projects: {
      type: 'list',
      title: 'Projects',
      items: [
        {
          id: String, // e.g., "proj_1", "proj_2"
          name: String,
          description: String,
          technologies: [String],
          bullets: [
            {
              id: String, // e.g., "proj_1_bullet_1"
              content: String
            }
          ]
        }
      ]
    },
    education: {
      type: 'list',
      title: 'Education',
      items: [
        {
          id: String, // e.g., "edu_1", "edu_2"
          institution: String,
          degree: String,
          field: String,
          graduationYear: String,
          details: [String] // e.g., GPA, honors, relevant coursework
        }
      ]
    },
    certifications: {
      type: 'list',
      title: 'Certifications',
      items: [
        {
          id: String, // e.g., "cert_1", "cert_2"
          name: String,
          issuer: String,
          date: String,
          credentialUrl: String
        }
      ]
    }
  }
};

/**
 * Example Resume Content JSON
 */
const exampleResumeContent = {
  metadata: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1-234-567-8900',
    location: 'San Francisco, CA',
    links: [
      {
        label: 'GitHub',
        url: 'https://github.com/johndoe'
      },
      {
        label: 'LinkedIn',
        url: 'https://linkedin.com/in/johndoe'
      }
    ]
  },
  sections: {
    summary: {
      type: 'text',
      title: 'Professional Summary',
      content: 'Senior Backend Engineer with 5+ years of experience building scalable distributed systems. Expertise in Node.js, microservices architecture, and cloud infrastructure.'
    },
    skills: {
      type: 'list',
      title: 'Core Skills',
      items: [
        {
          id: 'skill_1',
          category: 'Backend',
          content: 'Node.js, Express, NestJS, Python, Django'
        },
        {
          id: 'skill_2',
          category: 'Databases',
          content: 'PostgreSQL, MongoDB, Redis, Elasticsearch'
        },
        {
          id: 'skill_3',
          category: 'DevOps',
          content: 'Docker, Kubernetes, AWS, CI/CD, GitHub Actions'
        }
      ]
    },
    experience: {
      type: 'list',
      title: 'Professional Experience',
      items: [
        {
          id: 'exp_1',
          company: 'Unacademy',
          position: 'Senior Backend Engineer',
          duration: 'Jan 2021 - Present',
          location: 'Bangalore, India',
          bullets: [
            {
              id: 'exp_1_bullet_1',
              content: 'Architected microservices platform handling 10M+ daily requests with 99.9% uptime'
            },
            {
              id: 'exp_1_bullet_2',
              content: 'Led team of 5 engineers to redesign payment system, reducing latency by 40%'
            },
            {
              id: 'exp_1_bullet_3',
              content: 'Implemented distributed caching strategy using Redis, improving response time by 60%'
            }
          ]
        },
        {
          id: 'exp_2',
          company: 'TechStartup',
          position: 'Backend Engineer',
          duration: 'Jun 2019 - Dec 2020',
          location: 'San Francisco, CA',
          bullets: [
            {
              id: 'exp_2_bullet_1',
              content: 'Built RESTful APIs serving 1M+ requests per day with 99.5% uptime'
            },
            {
              id: 'exp_2_bullet_2',
              content: 'Optimized database queries, reducing average response time from 500ms to 100ms'
            }
          ]
        }
      ]
    },
    projects: {
      type: 'list',
      title: 'Projects',
      items: [
        {
          id: 'proj_1',
          name: 'Real-time Analytics Platform',
          description: 'Built a real-time analytics platform processing 100K events per second',
          technologies: ['Node.js', 'Kafka', 'Elasticsearch', 'Kubernetes'],
          bullets: [
            {
              id: 'proj_1_bullet_1',
              content: 'Designed event streaming architecture using Apache Kafka'
            },
            {
              id: 'proj_1_bullet_2',
              content: 'Implemented real-time dashboards with WebSocket connections'
            }
          ]
        }
      ]
    },
    education: {
      type: 'list',
      title: 'Education',
      items: [
        {
          id: 'edu_1',
          institution: 'University of California, Berkeley',
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          graduationYear: '2019',
          details: ['GPA: 3.8/4.0', 'Dean\'s List']
        }
      ]
    },
    certifications: {
      type: 'list',
      title: 'Certifications',
      items: [
        {
          id: 'cert_1',
          name: 'AWS Certified Solutions Architect',
          issuer: 'Amazon Web Services',
          date: 'Mar 2022',
          credentialUrl: 'https://aws.amazon.com/certification'
        }
      ]
    }
  }
};

/**
 * Validates resume content against schema
 * @param {Object} content - Resume content to validate
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
function validateResumeContent(content) {
  const errors = [];

  // Validate metadata
  if (!content.metadata) {
    errors.push('Missing metadata section');
  } else {
    if (!content.metadata.name) errors.push('Missing metadata.name');
    if (!content.metadata.email) errors.push('Missing metadata.email');
  }

  // Validate sections
  if (!content.sections) {
    errors.push('Missing sections object');
  } else {
    // Validate each section has required fields
    Object.entries(content.sections).forEach(([sectionKey, section]) => {
      if (!section.type) {
        errors.push(`Section ${sectionKey} missing type (should be 'text' or 'list')`);
      }
      if (!section.title) {
        errors.push(`Section ${sectionKey} missing title`);
      }

      // Validate text sections
      if (section.type === 'text' && !section.content) {
        errors.push(`Text section ${sectionKey} missing content`);
      }

      // Validate list sections
      if (section.type === 'list' && !Array.isArray(section.items)) {
        errors.push(`List section ${sectionKey} items should be an array`);
      }

      // Validate items have IDs
      if (section.type === 'list' && Array.isArray(section.items)) {
        section.items.forEach((item, index) => {
          if (!item.id) {
            errors.push(`Section ${sectionKey} item ${index} missing id`);
          }
        });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get nested value from content by path
 * @param {Object} content - Resume content
 * @param {Array} path - Path array, e.g., ['sections', 'experience', 'items', 0, 'bullets', 0, 'content']
 * @returns {*} - Value at path
 */
function getNestedValue(content, path) {
  return path.reduce((obj, key) => obj?.[key], content);
}

/**
 * Set nested value in content by path
 * @param {Object} content - Resume content
 * @param {Array} path - Path array
 * @param {*} value - Value to set
 */
function setNestedValue(content, path, value) {
  const lastKey = path.pop();
  const obj = path.reduce((o, key) => o[key], content);
  obj[lastKey] = value;
}

export {
  resumeContentSchema,
  exampleResumeContent,
  validateResumeContent,
  getNestedValue,
  setNestedValue
};
