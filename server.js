const express = require('express');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const db = require('./database');
const app = express();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const PORT = 3000;

// Serve the login page
app.get('/', (req, res) => {
  res.render('login');
});

// Serve the signup page
app.get('/signup', (req, res) => {
  res.render('signup');
});

// Serve the dashboard page
app.get('/dashboard', (req, res) => {
  const { userId, username, transferMessage } = req.query; // Get userId or username from query parameters

  if (!userId && !username) {
    return res.status(400).send('Invalid request. Please provide a userId or username.');
  }

  // Query to fetch user based on either userId or username
  const userQuery = userId
    ? 'SELECT id, first_name, last_name FROM users WHERE id = ?'
    : 'SELECT id, first_name, last_name FROM users WHERE username = ?';

  const queryParam = userId || username;

  db.get(userQuery, [queryParam], (err, user) => {
    if (err) {
      return res.status(500).send('Error fetching user');
    }

    if (!user) {
      return res.status(404).send('User not found');
    }

    // Query to fetch transactions for the user
    const transactionQuery = 'SELECT type, amount, date FROM transactions WHERE user_id = ? ORDER BY date DESC';

    db.all(transactionQuery, [user.id], (err, transactions) => {
      if (err) {
        return res.status(500).send('Error fetching transactions');
      }

      // Dynamically calculate the balance
      let balance = 0;
      transactions.forEach(transaction => {
        if (transaction.type === 'deposit') {
          balance += transaction.amount; // Add deposit amounts
        } else if (transaction.type === 'withdrawal') {
          balance -= transaction.amount; // Subtract withdrawal amounts
        }
      });

      // Update the balance in the users table
      db.run(
        'UPDATE users SET balance = ? WHERE id = ?',
        [balance, user.id],
        (updateErr) => {
          if (updateErr) {
            console.error('Error updating user balance:', updateErr);
            return res.status(500).send('Error updating user balance');
          }

          // Render the dashboard with user, transactions, and calculated balance
          res.render('dashboard', { user, transactions, balance, transferMessage });
        }
      );
    });
  });
});

// Handle the transfer between accounts
app.post('/transfer', (req, res) => {
  const { senderId, recipientUsername, amount } = req.body; // Get the data from the transfer form

  if (!senderId || !recipientUsername || !amount) {
    return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Invalid transfer request. All fields are required.`);
  }

  // Ensure amount is a positive number
  const transferAmount = parseFloat(amount);
  if (isNaN(transferAmount) || transferAmount <= 0) {
    return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Invalid amount. Please enter a positive number.`);
  }

  // Step 1: Get the sender's details
  db.get('SELECT id, balance FROM users WHERE id = ?', [senderId], (err, sender) => {
    if (err) {
      return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Error fetching sender details.`);
    }

    if (!sender) {
      return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Sender not found.`);
    }

    if (sender.balance < transferAmount) {
      return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Insufficient balance for transfer.`);
    }

    // Step 2: Get the recipient's details
    db.get('SELECT id, username, balance FROM users WHERE username = ?', [recipientUsername], (err, recipient) => {
      if (err) {
        return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Error fetching recipient details.`);
      }

      if (!recipient) {
        return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Recipient not found.`);
      }

      // Step 3: Perform the transfer
      const newSenderBalance = sender.balance - transferAmount;
      const newRecipientBalance = recipient.balance + transferAmount;

      // Update both sender's and recipient's balances
      db.run(
        'UPDATE users SET balance = ? WHERE id = ?',
        [newSenderBalance, sender.id],
        (err) => {
          if (err) {
            return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Error updating sender balance.`);
          }

          db.run(
            'UPDATE users SET balance = ? WHERE id = ?',
            [newRecipientBalance, recipient.id],
            (err) => {
              if (err) {
                return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Error updating recipient balance.`);
              }

              // Step 4: Create transactions for both sender and recipient
              const transactionDate = new Date().toISOString();

              // Sender's transaction (withdrawal)
              db.run(
                'INSERT INTO transactions (user_id, type, amount, date) VALUES (?, "withdrawal", ?, ?)',
                [sender.id, transferAmount, transactionDate],
                (err) => {
                  if (err) {
                    return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Error creating sender transaction.`);
                  }

                  // Recipient's transaction (deposit)
                  db.run(
                    'INSERT INTO transactions (user_id, type, amount, date) VALUES (?, "deposit", ?, ?)',
                    [recipient.id, transferAmount, transactionDate],
                    (err) => {
                      if (err) {
                        return res.redirect(`/dashboard?userId=${senderId}&transferMessage=Error creating recipient transaction.`);
                      }

                      // Step 5: Redirect or respond with success
                      res.redirect(`/dashboard?userId=${senderId}&transferMessage=Transfer successful.`);
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });
});

app.get('/admin-transfer', (req, res) => {
  db.all('SELECT first_name, last_name, username FROM users', (err, users) => {
    if (err) {
      return res.status(500).send('Error fetching users');
    }
    res.render('admin-transfer', { users });
  });
});

// Admin transfers money
app.post('/admin-transfer', (req, res) => {
  const { recipientUsername, amount } = req.body; // Get data from form

  if (!recipientUsername || !amount) {
    return res.status(400).send('Invalid request. All fields are required.');
  }

  // Ensure amount is a positive number
  const transferAmount = parseFloat(amount);
  if (isNaN(transferAmount) || transferAmount <= 0) {
    return res.status(400).send('Invalid amount. Please enter a positive number.');
  }

  // Step 1: Get recipient's details
  db.get('SELECT id, username, balance FROM users WHERE username = ?', [recipientUsername], (err, recipient) => {
    if (err) {
      return res.status(500).send('Error fetching recipient details');
    }

    if (!recipient) {
      return res.status(404).send('Recipient not found');
    }

    // Step 2: Perform the transfer
    const newRecipientBalance = recipient.balance + transferAmount;

    // Update recipient's balance
    db.run(
      'UPDATE users SET balance = ? WHERE id = ?',
      [newRecipientBalance, recipient.id],
      (err) => {
        if (err) {
          return res.status(500).send('Error updating recipient balance');
        }

        // Step 3: Create a transaction record for the recipient (deposit)
        const transactionDate = new Date().toISOString();
        db.run(
          'INSERT INTO transactions (user_id, type, amount, date) VALUES (?, "deposit", ?, ?)',
          [recipient.id, transferAmount, transactionDate],
          (err) => {
            if (err) {
              return res.status(500).send('Error creating recipient transaction');
            }

            // Step 4: Respond with success
            res.send('Transfer successful');
          }
        );
      }
    );
  });
});

// Handle signup
app.post('/signup', (req, res) => {
  const { first_name, last_name, username, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run('INSERT INTO users (first_name, last_name, username, password) VALUES (?, ?, ?, ?)',
    [first_name, last_name, username, hashedPassword], function (err) {
      if (err) {
        console.error(err);
        return res.render('signup', { errorMessage: 'Username already taken. Please choose another one.' });
      }
      res.redirect('/');
    });
});

// Handle login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err || !user) {
      console.error(err);
      return res.render('login', { errorMessage: 'Username or password is incorrect. Please try again.' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password);
    if (passwordMatch) {
      res.redirect(`/dashboard?username=${username}`);
    } else {
      res.render('login', { errorMessage: 'Username or password is incorrect. Please try again.' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});