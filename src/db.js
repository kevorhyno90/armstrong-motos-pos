const DB_NAME = 'ArmstrongMotosDB';
const DB_VERSION = 1;

let dbInstance = null;

// Initialize the database
export function initDb() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database failed to open:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      console.log('Database opened successfully');
      checkAndSeedDatabase(dbInstance).then(() => {
        resolve(dbInstance);
      });
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Products store: id is primary key (can be SKU or random UUID)
      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('name', 'name', { unique: false });
        productStore.createIndex('sku', 'sku', { unique: true });
        productStore.createIndex('category', 'category', { unique: false });
      }

      // Sales store: transaction id is primary key
      if (!db.objectStoreNames.contains('sales')) {
        const salesStore = db.createObjectStore('sales', { keyPath: 'id' });
        salesStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Settings store: key-value pairs
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

// Helper to get object store
function getStore(storeName, mode = 'readonly') {
  return initDb().then((db) => {
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
}

// PRODUCT METHODS
export function getProducts() {
  return getStore('products').then((store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveProduct(product) {
  return getStore('products', 'readwrite').then((store) => {
    return new Promise((resolve, reject) => {
      const request = store.put(product);
      request.onsuccess = () => resolve(product);
      request.onerror = () => reject(request.error);
    });
  });
}

export function deleteProduct(id) {
  return getStore('products', 'readwrite').then((store) => {
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  });
}

// SALES METHODS
export function getSales() {
  return getStore('sales').then((store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function addSale(sale) {
  return getStore('sales', 'readwrite').then((store) => {
    return new Promise((resolve, reject) => {
      const request = store.add(sale);
      request.onsuccess = () => resolve(sale);
      request.onerror = () => reject(request.error);
    });
  });
}

// SETTINGS METHODS
export function getSettings() {
  return getStore('settings').then((store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const settingsObj = {};
        request.result.forEach((item) => {
          settingsObj[item.key] = item.value;
        });
        resolve(settingsObj);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveSetting(key, value) {
  return getStore('settings', 'readwrite').then((store) => {
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve({ key, value });
      request.onerror = () => reject(request.error);
    });
  });
}

// BACKUP & RESTORE METHODS
export async function exportBackup() {
  const products = await getProducts();
  const sales = await getSales();
  
  // Fetch settings manually
  const settingsStore = await getStore('settings');
  const settings = await new Promise((resolve, reject) => {
    const req = settingsStore.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const backupData = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    products,
    sales,
    settings
  };

  return JSON.stringify(backupData, null, 2);
}

export async function importBackup(jsonString) {
  const data = JSON.parse(jsonString);
  
  if (!data.products || !data.sales) {
    throw new Error('Invalid backup file format');
  }

  const db = await initDb();

  // Clear existing databases and populate new items in a single transaction
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['products', 'sales', 'settings'], 'readwrite');
    
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();

    const pStore = transaction.objectStore('products');
    const sStore = transaction.objectStore('sales');
    const setStore = transaction.objectStore('settings');

    pStore.clear();
    sStore.clear();
    setStore.clear();

    // Import products
    data.products.forEach((product) => {
      pStore.put(product);
    });

    // Import sales
    data.sales.forEach((sale) => {
      sStore.put(sale);
    });

    // Import settings if available
    if (data.settings && Array.isArray(data.settings)) {
      data.settings.forEach((setting) => {
        setStore.put(setting);
      });
    }
  });
}

// Database Seeder for Bajaj Boxer 100 & 150 Spares
function checkAndSeedDatabase(db) {
  return new Promise((resolve) => {
    const transaction = db.transaction('products', 'readonly');
    const store = transaction.objectStore('products');
    const countRequest = store.count();

    countRequest.onsuccess = () => {
      if (countRequest.result === 0) {
        console.log('IndexedDB is empty. Seeding Armstrong Motos defaults...');
        const writeTransaction = db.transaction('products', 'readwrite');
        const writeStore = writeTransaction.objectStore('products');

        const defaultSpares = [
          {
            id: 'AM-10001',
            sku: 'AM-10001',
            name: 'NGK Spark Plug CPR8EA-9 (Genuine)',
            category: 'Electrical',
            model: 'Bajaj Boxer 150',
            cost: 200.00,
            price: 350.00,
            stock: 15,
            minStock: 5,
            photo: null
          },
          {
            id: 'AM-10002',
            sku: 'AM-10002',
            name: 'NGK Spark Plug C7HSA',
            category: 'Electrical',
            model: 'Bajaj Boxer 100',
            cost: 150.00,
            price: 250.00,
            stock: 20,
            minStock: 5,
            photo: null
          },
          {
            id: 'AM-10003',
            sku: 'AM-10003',
            name: 'Front Brake Cable Assembly',
            category: 'Braking',
            model: 'Bajaj Boxer 100 / 150',
            cost: 220.00,
            price: 400.00,
            stock: 8,
            minStock: 3,
            photo: null
          },
          {
            id: 'AM-10004',
            sku: 'AM-10004',
            name: 'Clutch Cable (Genuine Bajaj)',
            category: 'Accessories',
            model: 'Bajaj Boxer 150',
            cost: 250.00,
            price: 450.00,
            stock: 12,
            minStock: 4,
            photo: null
          },
          {
            id: 'AM-10005',
            sku: 'AM-10005',
            name: 'Clutch Cable Standard',
            category: 'Accessories',
            model: 'Bajaj Boxer 100',
            cost: 200.00,
            price: 350.00,
            stock: 10,
            minStock: 4,
            photo: null
          },
          {
            id: 'AM-10006',
            sku: 'AM-10006',
            name: 'Motul 20W50 4T Engine Oil (1L)',
            category: 'Lubes',
            model: 'Bajaj Boxer 100 / 150',
            cost: 600.00,
            price: 850.00,
            stock: 25,
            minStock: 5,
            photo: null
          },
          {
            id: 'AM-10007',
            sku: 'AM-10007',
            name: 'Engine Oil Filter (Genuine)',
            category: 'Engine',
            model: 'Bajaj Boxer 150',
            cost: 120.00,
            price: 250.00,
            stock: 30,
            minStock: 10,
            photo: null
          },
          {
            id: 'AM-10008',
            sku: 'AM-10008',
            name: 'Air Filter Sponge Element',
            category: 'Engine',
            model: 'Bajaj Boxer 100 / 150',
            cost: 180.00,
            price: 350.00,
            stock: 14,
            minStock: 5,
            photo: null
          },
          {
            id: 'AM-10009',
            sku: 'AM-10009',
            name: 'Front Drive Sprocket (14T)',
            category: 'Engine',
            model: 'Bajaj Boxer 100 / 150',
            cost: 300.00,
            price: 550.00,
            stock: 6,
            minStock: 3,
            photo: null
          },
          {
            id: 'AM-10010',
            sku: 'AM-10010',
            name: 'Rear Chain Wheel Sprocket (42T)',
            category: 'Engine',
            model: 'Bajaj Boxer 150',
            cost: 800.00,
            price: 1300.00,
            stock: 4,
            minStock: 2,
            photo: null
          },
          {
            id: 'AM-10011',
            sku: 'AM-10011',
            name: 'Heavy Duty Drive Chain 428H-120L',
            category: 'Suspension',
            model: 'Bajaj Boxer 100 / 150',
            cost: 900.00,
            price: 1500.00,
            stock: 5,
            minStock: 2,
            photo: null
          },
          {
            id: 'AM-10012',
            sku: 'AM-10012',
            name: 'Front Brake Shoes Set',
            category: 'Braking',
            model: 'Bajaj Boxer 100',
            cost: 250.00,
            price: 450.00,
            stock: 10,
            minStock: 4,
            photo: null
          },
          {
            id: 'AM-10013',
            sku: 'AM-10013',
            name: 'Front Brake Disc Pads Set',
            category: 'Braking',
            model: 'Bajaj Boxer 150',
            cost: 350.00,
            price: 650.00,
            stock: 8,
            minStock: 3,
            photo: null
          },
          {
            id: 'AM-10014',
            sku: 'AM-10014',
            name: 'Rear Brake Shoes Set',
            category: 'Braking',
            model: 'Bajaj Boxer 100 / 150',
            cost: 280.00,
            price: 500.00,
            stock: 15,
            minStock: 4,
            photo: null
          },
          {
            id: 'AM-10015',
            sku: 'AM-10015',
            name: 'Clutch Plates Set (5 Pieces)',
            category: 'Engine',
            model: 'Bajaj Boxer 150',
            cost: 950.00,
            price: 1600.00,
            stock: 3,
            minStock: 2,
            photo: null
          },
          {
            id: 'AM-10016',
            sku: 'AM-10016',
            name: 'Piston Kit Standard (57mm)',
            category: 'Engine',
            model: 'Bajaj Boxer 100',
            cost: 1200.00,
            price: 2000.00,
            stock: 2,
            minStock: 2,
            photo: null
          },
          {
            id: 'AM-10017',
            sku: 'AM-10017',
            name: 'Halogen Headlight Bulb (12V 35/35W)',
            category: 'Electrical',
            model: 'Bajaj Boxer 100 / 150',
            cost: 100.00,
            price: 200.00,
            stock: 18,
            minStock: 5,
            photo: null
          },
          {
            id: 'AM-10018',
            sku: 'AM-10018',
            name: 'Amber Turn Signal Blinker indicator',
            category: 'Electrical',
            model: 'Bajaj Boxer 100 / 150',
            cost: 150.00,
            price: 300.00,
            stock: 12,
            minStock: 4,
            photo: null
          },
          {
            id: 'AM-10019',
            sku: 'AM-10019',
            name: 'Carburetor Assembly BM150',
            category: 'Engine',
            model: 'Bajaj Boxer 150',
            cost: 2200.00,
            price: 3800.00,
            stock: 2,
            minStock: 1,
            photo: null
          },
          {
            id: 'AM-10020',
            sku: 'AM-10020',
            name: 'Front Shock Absorber Oil Seals',
            category: 'Suspension',
            model: 'Bajaj Boxer 100 / 150',
            cost: 180.00,
            price: 350.00,
            stock: 16,
            minStock: 5,
            photo: null
          }
        ];

        defaultSpares.forEach(spare => writeStore.put(spare));

        writeTransaction.oncomplete = () => {
          console.log('Seeded Bajaj spares successfully.');
          resolve();
        };
        writeTransaction.onerror = () => {
          console.error('Seeding failed.');
          resolve();
        };
      } else {
        resolve();
      }
    };

    countRequest.onerror = () => {
      resolve();
    };
  });
}
